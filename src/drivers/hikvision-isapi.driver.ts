import type { BridgeConfig, DeviceConfig } from '../config';
import type { AttendanceDeviceDriver, NormalizedPunchEvent } from './attendance-device-driver';
import {
  DigestAuthClient,
  detectChallengeType,
  formatAuthDiag,
  type AuthChallengeType,
  type AuthMode,
} from './digest-auth';

export type DeviceProbeStep = {
  name: string;
  ok: boolean;
  status?: number;
  challengeType?: AuthChallengeType;
  warning?: string;
  detail?: string;
};

export type DeviceProbeResult = {
  diagnosis:
    | 'DEVICE_AUTH_OK'
    | 'DEVICE_AUTH_FAILED'
    | 'DEVICE_ENDPOINT_UNSUPPORTED'
    | 'DEVICE_REACHABLE_BUT_EVENTS_FAILED'
    | 'DEVICE_UNREACHABLE';
  tcpOk: boolean;
  steps: DeviceProbeStep[];
  challengeType?: AuthChallengeType;
};

const MAX_BODY_LOG = 400;

function truncateBody(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_BODY_LOG) return cleaned;
  return `${cleaned.slice(0, MAX_BODY_LOG)}…`;
}

export class HikvisionIsapiDriver implements AttendanceDeviceDriver {
  readonly name = 'isapi';
  private client: DigestAuthClient;
  private lastDeviceError: string | null = null;

  constructor(
    private readonly device: DeviceConfig,
    private readonly isapi: BridgeConfig['isapi'],
  ) {
    const port = device.port ?? 80;
    const base = `http://${device.localIp}:${port}`;
    const authMode = (device.authMode ?? 'auto') as AuthMode;
    this.client = new DigestAuthClient(device.username ?? 'admin', device.password ?? '', base, authMode);
  }

  getLastDeviceError(): string | null {
    return this.lastDeviceError;
  }

  private deviceInfoPath(): string {
    return this.isapi?.deviceInfoPath ?? '/ISAPI/System/deviceInfo';
  }

  private capabilitiesPath(): string {
    return this.isapi?.capabilitiesPath ?? '/ISAPI/AccessControl/capabilities';
  }

  private acsEventCapabilitiesPath(): string {
    return this.isapi?.acsEventCapabilitiesPath ?? '/ISAPI/AccessControl/AcsEvent/capabilities?format=json';
  }

  private eventsPath(): string {
    return this.isapi?.eventsPath ?? '/ISAPI/AccessControl/AcsEvent?format=json';
  }

  private eventsMethod(): 'POST' | 'GET' {
    const m = (this.device.eventsMethod ?? 'POST').toUpperCase();
    return m === 'GET' ? 'GET' : 'POST';
  }

  private logHttpFailure(endpoint: string, status: number, challengeType: AuthChallengeType, bodyText?: string): void {
    const line = formatAuthDiag({
      deviceIp: this.device.localIp,
      endpoint,
      status,
      challengeType,
    });
    const bodyPart = bodyText ? ` body=${truncateBody(bodyText)}` : '';
    console.warn(`${line}${bodyPart}`);
    this.lastDeviceError = `${line}${bodyPart}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const path = this.deviceInfoPath();
      const { response, meta } = await this.client.fetchWithAuth(path, { method: 'GET' });
      if (!response.ok) {
        this.logHttpFailure(path, response.status, meta.challengeType);
        return false;
      }
      this.lastDeviceError = null;
      return true;
    } catch (err) {
      this.lastDeviceError = `deviceInfo failed: ${(err as Error).message}`;
      return false;
    }
  }

  /** Capability + auth probe used by test-device and deep validate. */
  async probeCapabilities(): Promise<DeviceProbeResult> {
    const steps: DeviceProbeStep[] = [];
    let challengeType: AuthChallengeType | undefined;
    let authOk = false;
    let eventsOk = false;
    let eventsUnsupported = false;

    // deviceInfo
    try {
      const path = this.deviceInfoPath();
      const { response, meta } = await this.client.fetchWithAuth(path, { method: 'GET' });
      challengeType = meta.challengeType !== 'none' ? meta.challengeType : challengeType;
      if (meta.authAttempted && meta.challengeType !== 'none') {
        challengeType = meta.challengeType;
      }
      // Re-detect from first response if needed — fetchWithAuth already consumed; use meta
      if (response.status === 401) {
        steps.push({
          name: 'deviceInfo',
          ok: false,
          status: 401,
          challengeType: meta.challengeType,
          detail: 'Authentication rejected',
        });
        return {
          diagnosis: 'DEVICE_AUTH_FAILED',
          tcpOk: true,
          steps,
          challengeType: meta.challengeType,
        };
      }
      authOk = response.ok;
      steps.push({
        name: 'deviceInfo',
        ok: response.ok,
        status: response.status,
        challengeType: meta.challengeType,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logHttpFailure(path, response.status, meta.challengeType, body);
      }
    } catch (err) {
      steps.push({
        name: 'deviceInfo',
        ok: false,
        detail: String((err as Error).message ?? err),
      });
      return { diagnosis: 'DEVICE_UNREACHABLE', tcpOk: false, steps, challengeType };
    }

    // AccessControl capabilities (non-fatal)
    try {
      const path = this.capabilitiesPath();
      const { response, meta } = await this.client.fetchWithAuth(path, { method: 'GET' });
      if (meta.challengeType !== 'none') challengeType = meta.challengeType;
      if (response.status === 404 || response.status === 400) {
        steps.push({
          name: 'accessControlCapabilities',
          ok: false,
          status: response.status,
          warning: 'Capability endpoint unsupported — continuing with configured paths',
        });
      } else {
        steps.push({
          name: 'accessControlCapabilities',
          ok: response.ok,
          status: response.status,
          challengeType: meta.challengeType,
        });
      }
    } catch (err) {
      steps.push({
        name: 'accessControlCapabilities',
        ok: false,
        warning: `Capability probe skipped: ${(err as Error).message}`,
      });
    }

    // AcsEvent capabilities (non-fatal)
    try {
      const path = this.acsEventCapabilitiesPath();
      const { response, meta } = await this.client.fetchWithAuth(path, { method: 'GET' });
      if (meta.challengeType !== 'none') challengeType = meta.challengeType;
      if (response.status === 404 || response.status === 400) {
        steps.push({
          name: 'acsEventCapabilities',
          ok: false,
          status: response.status,
          warning: 'AcsEvent capabilities unsupported — continuing with configured eventsPath',
        });
      } else if (response.status === 401) {
        steps.push({
          name: 'acsEventCapabilities',
          ok: false,
          status: 401,
          challengeType: meta.challengeType,
        });
        return {
          diagnosis: 'DEVICE_AUTH_FAILED',
          tcpOk: true,
          steps,
          challengeType: meta.challengeType,
        };
      } else {
        steps.push({
          name: 'acsEventCapabilities',
          ok: response.ok,
          status: response.status,
          challengeType: meta.challengeType,
        });
      }
    } catch (err) {
      steps.push({
        name: 'acsEventCapabilities',
        ok: false,
        warning: `AcsEvent capabilities probe skipped: ${(err as Error).message}`,
      });
    }

    // Sample AcsEvent query
    try {
      const path = this.eventsPath();
      const method = this.eventsMethod();
      const end = new Date();
      const start = new Date(Date.now() - 3600_000);
      const init: RequestInit =
        method === 'POST'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                AcsEventCond: {
                  searchID: String(Date.now()),
                  searchResultPosition: 0,
                  maxResults: 1,
                  major: 5,
                  minor: 0,
                  startTime: start.toISOString(),
                  endTime: end.toISOString(),
                },
              }),
            }
          : { method: 'GET' };

      const { response, meta } = await this.client.fetchWithAuth(path, init);
      if (meta.challengeType !== 'none') challengeType = meta.challengeType;

      if (response.status === 401) {
        const body = await response.text().catch(() => '');
        this.logHttpFailure(path, 401, meta.challengeType, body);
        steps.push({
          name: 'acsEventSample',
          ok: false,
          status: 401,
          challengeType: meta.challengeType,
          detail: truncateBody(body),
        });
        return {
          diagnosis: authOk ? 'DEVICE_AUTH_FAILED' : 'DEVICE_AUTH_FAILED',
          tcpOk: true,
          steps,
          challengeType: meta.challengeType,
        };
      }

      if (response.status === 404 || response.status === 405) {
        eventsUnsupported = true;
        const body = await response.text().catch(() => '');
        steps.push({
          name: 'acsEventSample',
          ok: false,
          status: response.status,
          detail: truncateBody(body),
          warning: 'Events endpoint unsupported or wrong method',
        });
      } else if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logHttpFailure(path, response.status, meta.challengeType, body);
        steps.push({
          name: 'acsEventSample',
          ok: false,
          status: response.status,
          challengeType: meta.challengeType,
          detail: truncateBody(body),
        });
      } else {
        eventsOk = true;
        steps.push({
          name: 'acsEventSample',
          ok: true,
          status: response.status,
          challengeType: meta.challengeType,
        });
      }
    } catch (err) {
      steps.push({
        name: 'acsEventSample',
        ok: false,
        detail: String((err as Error).message ?? err),
      });
    }

    if (!authOk) {
      return { diagnosis: 'DEVICE_AUTH_FAILED', tcpOk: true, steps, challengeType };
    }
    if (eventsOk) {
      return { diagnosis: 'DEVICE_AUTH_OK', tcpOk: true, steps, challengeType };
    }
    if (eventsUnsupported) {
      return { diagnosis: 'DEVICE_ENDPOINT_UNSUPPORTED', tcpOk: true, steps, challengeType };
    }
    return { diagnosis: 'DEVICE_REACHABLE_BUT_EVENTS_FAILED', tcpOk: true, steps, challengeType };
  }

  async fetchUsers(): Promise<Array<{ deviceUserId: string; name?: string }>> {
    const path = this.isapi?.usersPath;
    if (!path) return [];
    try {
      const { response, meta } = await this.client.fetchWithAuth(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserInfoSearchCond: { searchID: '1', maxResults: 50, searchResultPosition: 0 } }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logHttpFailure(path, response.status, meta.challengeType, body);
        return [];
      }
      const json = (await response.json()) as {
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
    const path = this.eventsPath();
    const method = this.eventsMethod();
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
      const init: RequestInit =
        method === 'POST'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : { method: 'GET' };

      const { response, meta } = await this.client.fetchWithAuth(path, init);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logHttpFailure(path, response.status, meta.challengeType, text);
        // Never throw — caller keeps service running
        return [];
      }
      this.lastDeviceError = null;
      const json = (await response.json()) as {
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
      console.warn(
        formatAuthDiag({
          deviceIp: this.device.localIp,
          endpoint: path,
          status: 0,
          challengeType: 'none',
        }) + ` pull failed: ${(err as Error).message}`,
      );
      this.lastDeviceError = `pull failed: ${(err as Error).message}`;
      return [];
    }
  }
}

export { detectChallengeType };
