import { buildSourceHash } from '../crypto/source-hash';
import type { BridgeDb } from '../db/bridge-store';
import type { BridgeConfig, DeviceConfig } from '../config';
import { createDriver } from '../drivers';
import { HikvisionIsapiDriver } from '../drivers/hikvision-isapi.driver';
import { CentralApiClient } from '../central-api-client';
import { nextBackoff, sleep } from './backoff';

type DeviceRuntimeStatus = 'online' | 'error' | 'offline';

export class SyncRunner {
  private backoff = { attempt: 0, nextDelayMs: 2000 };
  private lastHeartbeat = 0;
  /** Per-device last known status for heartbeat / dashboard. */
  private deviceStatus = new Map<number, DeviceRuntimeStatus>();

  constructor(
    private readonly config: BridgeConfig,
    private readonly db: BridgeDb,
    private readonly client: CentralApiClient,
    private readonly tenantId: number,
  ) {}

  async runOnce(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeat >= this.config.heartbeatIntervalSeconds * 1000) {
      try {
        const deviceStatuses = this.config.devices
          .filter((d) => d.centralDeviceId)
          .map((d) => ({
            deviceId: d.centralDeviceId!,
            status: this.deviceStatus.get(d.centralDeviceId!) ?? 'online',
          }));
        await this.client.heartbeat(deviceStatuses.length ? deviceStatuses : undefined);
        this.lastHeartbeat = now;
      } catch (err) {
        this.db.logError('heartbeat', (err as Error).message);
      }
    }

    for (const deviceCfg of this.config.devices) {
      // Device errors must never throw out of pullDevice — service keeps running.
      await this.pullDevice(deviceCfg);
    }

    await this.flushQueue();
  }

  async loop(): Promise<void> {
    console.log('[bridge] sync loop started');
    for (;;) {
      try {
        await this.runOnce();
        this.backoff = nextBackoff(this.backoff, true);
      } catch (err) {
        // Central API / queue flush failures — still keep process alive
        this.db.logError('sync-loop', (err as Error).message);
        this.backoff = nextBackoff(this.backoff, false);
        console.warn(`[bridge] error, backing off ${this.backoff.nextDelayMs}ms`);
        await sleep(this.backoff.nextDelayMs);
        continue;
      }
      await sleep(this.config.pollIntervalSeconds * 1000);
    }
  }

  private async pullDevice(deviceCfg: DeviceConfig): Promise<void> {
    if (!deviceCfg.centralDeviceId) {
      this.db.logError('pull', `Device "${deviceCfg.name ?? 'unknown'}" missing centralDeviceId`);
      return;
    }
    const deviceId = deviceCfg.centralDeviceId;
    const driver = createDriver(deviceCfg, this.config);
    const cursor = this.db.getCursor(deviceId);
    let events;
    try {
      events = await driver.pullEvents(cursor);
      if (driver instanceof HikvisionIsapiDriver) {
        const err = driver.getLastDeviceError();
        if (err) {
          // HTTP 401 / device auth failures land here — log, mark error, do NOT throw
          this.db.logError(`pull:${deviceId}`, err);
          this.deviceStatus.set(deviceId, 'error');
          return;
        }
      }
      this.deviceStatus.set(deviceId, 'online');
    } catch (err) {
      this.db.logError(`pull:${deviceId}`, (err as Error).message);
      this.deviceStatus.set(deviceId, 'error');
      return;
    }

    for (const ev of events) {
      const sourceHash = buildSourceHash({
        tenantId: this.tenantId,
        deviceId: ev.centralDeviceId,
        deviceUserId: ev.deviceUserId,
        punchTimeUtc: ev.punchTimeUtc,
        verifyMode: ev.verifyMode,
        deviceEventId: ev.deviceEventId,
      });
      this.db.enqueueEvent({
        centralDeviceId: ev.centralDeviceId,
        deviceUserId: ev.deviceUserId,
        punchTimeUtc: ev.punchTimeUtc,
        punchTimeLocal: ev.punchTimeLocal ?? null,
        verifyMode: ev.verifyMode,
        direction: ev.direction,
        deviceEventId: ev.deviceEventId ?? null,
        sourceHash,
        rawPayload: ev.rawPayload ? JSON.stringify(ev.rawPayload) : null,
      });
      this.db.setCursor(ev.centralDeviceId, ev.punchTimeUtc, ev.deviceEventId ?? null);
    }
  }

  private async flushQueue(): Promise<void> {
    const queued = this.db.listQueued(this.config.maxBatchSize);
    if (queued.length === 0) return;

    const byDevice = new Map<number, typeof queued>();
    for (const row of queued) {
      const list = byDevice.get(row.centralDeviceId) ?? [];
      list.push(row);
      byDevice.set(row.centralDeviceId, list);
    }

    for (const [deviceId, rows] of byDevice) {
      let batchId: number | undefined;
      try {
        batchId = await this.client.startBatch(deviceId);
        const payload = rows.map((r) => ({
          deviceId: r.centralDeviceId,
          deviceUserId: r.deviceUserId,
          punchTimeUtc: r.punchTimeUtc,
          punchTimeLocal: r.punchTimeLocal,
          verifyMode: r.verifyMode,
          direction: r.direction,
          deviceEventId: r.deviceEventId,
          rawPayload: r.rawPayload ? JSON.parse(r.rawPayload) : undefined,
        }));
        const result = await this.client.pushEvents(batchId, payload);
        this.db.markSent(
          rows.map((r) => r.id),
          rows.map((r) => r.sourceHash),
        );
        if (batchId) {
          await this.client.finishBatch(batchId, {
            status: 'success',
            pulledCount: rows.length,
            acceptedCount: result.accepted,
            duplicateCount: result.duplicate,
            unmatchedCount: result.unmatched,
            failedCount: result.failed,
          });
        }
        this.backoff = nextBackoff(this.backoff, true);
      } catch (err) {
        this.db.logError(`push:${deviceId}`, (err as Error).message);
        this.backoff = nextBackoff(this.backoff, false);
        throw err;
      }
    }
  }
}
