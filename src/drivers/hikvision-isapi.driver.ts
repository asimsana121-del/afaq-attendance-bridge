import type { BridgeConfig, DeviceConfig } from '../config';
import type { AttendanceDeviceDriver, NormalizedPunchEvent } from './attendance-device-driver';
import { DigestAuthClient } from './digest-auth';

export class HikvisionIsapiDriver implements AttendanceDeviceDriver {
  readonly name = 'isapi';
  private client: DigestAuthClient;

  constructor(
    private readonly device: DeviceConfig,
    private readonly isapi: BridgeConfig['isapi'],
  ) {
    const port = device.port ?? 80;
    const base = `http://${device.localIp}:${port}`;
    this.client = new DigestAuthClient(device.username ?? 'admin', device.password ?? '', base);
  }

  async testConnection(): Promise<boolean> {
    try {
      const path = this.isapi?.deviceInfoPath ?? '/ISAPI/System/deviceInfo';
      const res = await this.client.fetch(path, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchUsers(): Promise<Array<{ deviceUserId: string; name?: string }>> {
    const path = this.isapi?.usersPath;
    if (!path) return [];
    try {
      const res = await this.client.fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserInfoSearchCond: { searchID: '1', maxResults: 50, searchResultPosition: 0 } }),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        UserInfoSearch?: { UserInfo?: Array<{ employeeNo?: string; name?: string }> };
      };
      const users = json.UserInfoSearch?.UserInfo ?? [];
      return users
        .filter((u) => u.employeeNo)
        .map((u) => ({ deviceUserId: String(u.employeeNo), name: u.name }));
    } catch {
      return [];
    }
  }

  async pullEvents(cursor: {
    lastPunchTimeUtc: string | null;
    lastEventId: string | null;
  }): Promise<NormalizedPunchEvent[]> {
    const path = this.isapi?.eventsPath ?? '/ISAPI/AccessControl/AcsEvent?format=json';
    const start = cursor.lastPunchTimeUtc ?? new Date(Date.now() - 24 * 3600_000).toISOString();
    const end = new Date().toISOString();
    const body = {
      AcsEventCond: {
        searchID: String(Date.now()),
        searchResultPosition: 0,
        maxResults: 50,
        major: 5,
        minor: 0,
        startTime: start,
        endTime: end,
      },
    };

    try {
      const res = await this.client.fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`[isapi] device ${this.device.centralDeviceId} events HTTP ${res.status}`);
        return [];
      }
      const json = (await res.json()) as {
        AcsEvent?: {
          InfoList?: Array<{
            employeeNoString?: string;
            time?: string;
            serialNo?: number;
            verifyMode?: string;
            direction?: string;
          }>;
        };
      };
      const list = json.AcsEvent?.InfoList ?? [];
      return list
        .filter((e) => e.employeeNoString && e.time)
        .map((e) => ({
          centralDeviceId: this.device.centralDeviceId,
          deviceUserId: String(e.employeeNoString),
          punchTimeUtc: new Date(e.time!).toISOString(),
          punchTimeLocal: e.time,
          verifyMode: String(e.verifyMode ?? 'unknown'),
          direction: String(e.direction ?? 'unknown'),
          deviceEventId: e.serialNo != null ? String(e.serialNo) : undefined,
          rawPayload: e as Record<string, unknown>,
        }))
        .filter((e) => !cursor.lastEventId || e.deviceEventId !== cursor.lastEventId);
    } catch (err) {
      console.warn(`[isapi] device ${this.device.centralDeviceId} pull failed:`, (err as Error).message);
      return [];
    }
  }
}
