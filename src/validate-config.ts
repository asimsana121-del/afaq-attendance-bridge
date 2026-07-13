import { existsSync, readFileSync } from 'fs';
import { connect } from 'net';
import { join } from 'path';
import {
  buildActivateUrl,
  formatCsrfMisconfigError,
  isCsrfBlockedResponse,
  validateCentralApiUrl,
} from './api-url-validation';
import { createClientFromConfig } from './central-api-client';
import { getDataDir, type DeviceConfig } from './config';
import { BridgeDb } from './db/bridge-store';

const PLACEHOLDER_CODES = new Set([
  'PASTE_ACTIVATION_CODE_HERE',
  'CHANGE_ME',
  '',
]);

export type ValidateConfigOptions = {
  configPath?: string;
  deep?: boolean;
  cwd?: string;
};

export type ValidateConfigResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeDevices(devices: unknown): DeviceConfig[] {
  if (!Array.isArray(devices)) return [];
  return devices.map((d) => {
    const row = d as Record<string, unknown>;
    const mode = (row.syncMode ?? row.driver ?? 'isapi') as DeviceConfig['syncMode'];
    return {
      centralDeviceId: Number(row.centralDeviceId ?? 0),
      name: row.name as string | undefined,
      vendor: row.vendor as string | undefined,
      model: row.model as string | undefined,
      localIp: row.localIp as string | undefined,
      port: row.port != null ? Number(row.port) : 80,
      username: row.username as string | undefined,
      password: row.password as string | undefined,
      syncMode: mode,
      driver: mode,
      branchCode: row.branchCode as string | undefined,
      csvPath: row.csvPath as string | undefined,
    };
  });
}

function readConfigFile(configPath?: string, cwd?: string): Record<string, unknown> {
  const base = cwd ?? process.cwd();
  const path = configPath ? configPath : join(base, 'config.json');
  if (!existsSync(path)) {
    throw new Error(`config.json not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function validateDevice(device: DeviceConfig, index: number, errors: string[]): void {
  const label = `devices[${index}]`;
  if (!Number.isFinite(device.centralDeviceId) || device.centralDeviceId <= 0) {
    errors.push(`ERROR: ${label}.centralDeviceId must be a positive number`);
  }
  const mode = device.syncMode ?? 'isapi';
  if (!['isapi', 'simulated', 'csv'].includes(mode)) {
    errors.push(`ERROR: ${label}.syncMode must be isapi, simulated, or csv`);
  }
  if (!device.branchCode || !String(device.branchCode).trim()) {
    errors.push(`ERROR: ${label}.branchCode is required`);
  }
  if (mode === 'isapi') {
    if (!device.localIp || !String(device.localIp).trim()) {
      errors.push(`ERROR: ${label}.localIp is required for isapi sync`);
    }
    if (!Number.isFinite(device.port) || (device.port ?? 0) <= 0) {
      errors.push(`ERROR: ${label}.port must be a positive number`);
    }
    if (!device.username || !String(device.username).trim()) {
      errors.push(`ERROR: ${label}.username is required for isapi sync`);
    }
    if (!device.password || !String(device.password).trim()) {
      errors.push(`ERROR: ${label}.password is required for isapi sync`);
    }
  }
  if (mode === 'csv') {
    if (!device.csvPath || !String(device.csvPath).trim()) {
      errors.push(`ERROR: ${label}.csvPath is required for csv sync`);
    }
  }
}

async function probeBridgeActivateEndpoint(apiBase: string): Promise<string | null> {
  const url = buildActivateUrl(apiBase);
  try {
    const res = await fetchWithTimeout(url, 8000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ activationCode: '__bridge_validate__' }),
    });
    const body = await res.json().catch(() => ({}));
    const message =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message ?? '')
        : '';
    if (isCsrfBlockedResponse(res.status, message)) {
      return formatCsrfMisconfigError(apiBase);
    }
    if (res.status === 403 && /csrf/i.test(message)) {
      return formatCsrfMisconfigError(apiBase);
    }
    if (res.status >= 500) {
      return 'ERROR: central API bridge activate endpoint returned server error (deep check)';
    }
    return null;
  } catch (err) {
    return `ERROR: bridge activate endpoint probe failed: ${String((err as Error).message ?? err)}`;
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { credentials: 'omit', ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: timeoutMs }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function validateConfig(options: ValidateConfigOptions = {}): Promise<ValidateConfigResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cwd = options.cwd ?? process.cwd();

  let raw: Record<string, unknown>;
  try {
    raw = readConfigFile(options.configPath, cwd);
  } catch (err) {
    return {
      ok: false,
      errors: [`ERROR: ${String((err as Error).message ?? err)}`],
      warnings,
    };
  }

  const api =
    (raw.centralApiBaseUrl as string | undefined) ??
    (raw.apiBaseUrl as string | undefined) ??
    '';
  if (!api || !String(api).trim()) {
    errors.push('ERROR: centralApiBaseUrl is required');
  } else if (!isValidUrl(api.replace(/\/$/, ''))) {
    errors.push('ERROR: centralApiBaseUrl must be a valid http(s) URL');
  } else {
    const urlCheck = validateCentralApiUrl(api);
    errors.push(...urlCheck.errors);
    warnings.push(...urlCheck.warnings);
  }

  if (!raw.tenantSlug || !String(raw.tenantSlug).trim()) {
    errors.push('ERROR: tenantSlug is required');
  }

  if (!raw.timezone || !String(raw.timezone).trim()) {
    errors.push('ERROR: timezone is required');
  }

  const syncSec = Number(raw.syncIntervalSeconds ?? raw.pollIntervalSeconds ?? 0);
  if (!Number.isFinite(syncSec) || syncSec <= 0) {
    errors.push('ERROR: syncIntervalSeconds must be a positive number');
  }

  const devices = normalizeDevices(raw.devices);
  if (devices.length === 0) {
    errors.push('ERROR: at least one device is required in devices[]');
  }
  devices.forEach((d, i) => validateDevice(d, i, errors));

  const activationCode = String(raw.activationCode ?? '').trim();
  if (PLACEHOLDER_CODES.has(activationCode)) {
    warnings.push('WARNING: activationCode is not set (required before first run)');
  }

  if (options.deep) {
    if (PLACEHOLDER_CODES.has(activationCode)) {
      errors.push('ERROR: activationCode must be set before deep validation');
    }

    const apiBase = api.replace(/\/$/, '');
    if (apiBase && isValidUrl(apiBase)) {
      let reachable = false;
      for (const path of ['/health', '']) {
        try {
          const res = await fetchWithTimeout(`${apiBase}${path}`, 5000);
          if (res.status < 500) reachable = true;
        } catch {
          // try next
        }
      }
      if (!reachable) {
        errors.push('ERROR: central API is not reachable (deep check)');
      }

      const csrfErr = await probeBridgeActivateEndpoint(apiBase);
      if (csrfErr) errors.push(csrfErr);
    }

    const prevCwd = process.cwd();
    try {
      process.chdir(cwd);
      const db = new BridgeDb(getDataDir());
      const token = db.getStatus('bridgeToken');
      if (token) {
        try {
          const client = createClientFromConfig(
            {
              centralApiBaseUrl: apiBase,
              pollIntervalSeconds: syncSec,
              heartbeatIntervalSeconds: Number(raw.heartbeatIntervalSeconds ?? 120),
              maxBatchSize: Number(raw.maxBatchSize ?? 100),
              devices,
            },
            token,
          );
          await client.fetchConfig();
        } catch (err) {
          errors.push(`ERROR: bridge token config fetch failed: ${String((err as Error).message ?? err)}`);
        }
      } else {
        warnings.push('WARNING: bridge not activated yet (no token in data/)');
      }
    } finally {
      process.chdir(prevCwd);
    }

    for (let i = 0; i < devices.length; i++) {
      const d = devices[i];
      if ((d.syncMode ?? 'isapi') !== 'isapi' || !d.localIp) continue;
      const port = d.port ?? 80;
      const ok = await probeTcp(d.localIp, port, 3000);
      if (!ok) {
        errors.push(`ERROR: devices[${i}] ${d.localIp}:${port} is not reachable (deep check)`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function formatValidateOutput(result: ValidateConfigResult): string {
  const lines: string[] = [];
  for (const w of result.warnings) lines.push(w);
  for (const e of result.errors) lines.push(e);
  if (result.ok) lines.push('CONFIG OK');
  return lines.join('\n');
}
