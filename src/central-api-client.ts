import { getMachineId, type BridgeConfig } from './config';
import { formatCsrfMisconfigError, isCsrfBlockedResponse } from './api-url-validation';
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

function extractMessage(body: unknown): string {
  if (body && typeof body === 'object') {
    const row = body as Record<string, unknown>;
    if (typeof row.message === 'string') return row.message;
    if (typeof row.error === 'string') return row.error;
    if (Array.isArray(row.message)) return row.message.join('; ');
  }
  return '';
}

export function formatBridgeApiError(
  status: number,
  body: unknown,
  apiBaseUrl: string,
  fallback: string,
): string {
  const message = extractMessage(body) || fallback;
  if (isCsrfBlockedResponse(status, message)) {
    return formatCsrfMisconfigError(apiBaseUrl);
  }
  return message;
}

const FETCH_INIT = { credentials: 'omit' as const };

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
      ...FETCH_INIT,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        activationCode,
        machineId: getMachineId(),
        version: getBridgeVersion(),
        name: bridgeName ?? `Bridge ${getMachineId()}`,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(formatBridgeApiError(res.status, body, this.apiBaseUrl, `Activate failed: ${res.status}`));
    }
    return body;
  }

  async heartbeat(deviceStatuses?: Array<{ deviceId: number; status: string }>): Promise<void> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/heartbeat`, {
      ...FETCH_INIT,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        machineId: getMachineId(),
        version: getBridgeVersion(),
        deviceStatuses,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(formatBridgeApiError(res.status, body, this.apiBaseUrl, `Heartbeat failed: ${res.status}`));
    }
  }

  async fetchConfig(): Promise<CentralBridgeConfig> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/config`, {
      ...FETCH_INIT,
      headers: this.headers(),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(formatBridgeApiError(res.status, body, this.apiBaseUrl, `Config failed: ${res.status}`));
    }
    return body;
  }

  async startBatch(deviceId: number): Promise<number> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/sync-batch`, {
      ...FETCH_INIT,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ deviceId }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(formatBridgeApiError(res.status, body, this.apiBaseUrl, `Start batch failed: ${res.status}`));
    }
    return body.batchId as number;
  }

  async finishBatch(batchId: number, stats: Record<string, number | string>): Promise<void> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/sync-batch`, {
      ...FETCH_INIT,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ action: 'finish', batchId, ...stats }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(formatBridgeApiError(res.status, body, this.apiBaseUrl, `Finish batch failed: ${res.status}`));
    }
  }

  async pushEvents(batchId: number | undefined, events: unknown[]): Promise<{
    accepted: number;
    duplicate: number;
    unmatched: number;
    failed: number;
  }> {
    const res = await fetch(`${this.apiBaseUrl}/hrm/attendance/bridges/sync-events`, {
      ...FETCH_INIT,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ batchId, events }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(formatBridgeApiError(res.status, body, this.apiBaseUrl, `Push events failed: ${res.status}`));
    }
    return body;
  }
}

export function createClientFromConfig(config: BridgeConfig, token: string): CentralApiClient {
  const base = (config.centralApiBaseUrl || config.apiBaseUrl || '').replace(/\/$/, '');
  return new CentralApiClient(base, token);
}
