import { getMachineId, type BridgeConfig } from './config';
import { getBridgeVersion } from './version';

export type CentralBridgeConfig = {
  tenantId: number;
  branchId: number | null;
  devices: Array<{
    id: number;
    deviceCode: string;
    name: string;
    syncMode: string;
    cursor: { lastPunchTimeUtc?: string; lastEventId?: string } | null;
  }>;
};

export class CentralApiClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async activate(activationCode: string, bridgeName?: string): Promise<{
    bridgeToken: string;
    bridgeId?: number;
    tenantId: number;
    config: CentralBridgeConfig;
  }> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        activationCode,
        machineId: getMachineId(),
        version: getBridgeVersion(),
        name: bridgeName ?? `Bridge ${getMachineId()}`,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? `Activate failed: ${res.status}`);
    return body;
  }

  async heartbeat(deviceStatuses?: Array<{ deviceId: number; status: string }>): Promise<void> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/heartbeat`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        machineId: getMachineId(),
        version: getBridgeVersion(),
        deviceStatuses,
      }),
    });
    if (!res.ok) throw new Error(`Heartbeat failed: ${res.status}`);
  }

  async fetchConfig(): Promise<CentralBridgeConfig> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/config`, {
      headers: this.headers(),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? `Config failed: ${res.status}`);
    return body;
  }

  async startBatch(deviceId: number): Promise<number> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/sync-batch`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ deviceId }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? `Start batch failed: ${res.status}`);
    return body.batchId as number;
  }

  async finishBatch(batchId: number, stats: Record<string, number | string>): Promise<void> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/sync-batch`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ action: 'finish', batchId, ...stats }),
    });
    if (!res.ok) throw new Error(`Finish batch failed: ${res.status}`);
  }

  async pushEvents(batchId: number | undefined, events: unknown[]): Promise<{
    accepted: number;
    duplicate: number;
    unmatched: number;
    failed: number;
  }> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/sync-events`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ batchId, events }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? `Push events failed: ${res.status}`);
    return body;
  }
}

export function createClientFromConfig(config: BridgeConfig, token: string): CentralApiClient {
  const base = (config.centralApiBaseUrl || config.apiBaseUrl || '').replace(/\/$/, '');
  return new CentralApiClient(base, token);
}
