import { copyFileSync, existsSync, readFileSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';

export type AuthMode = 'auto' | 'digest' | 'basic';
export type EventsMethod = 'POST' | 'GET';

export type DeviceConfig = {
  centralDeviceId: number;
  name?: string;
  vendor?: string;
  model?: string;
  localIp?: string;
  port?: number;
  username?: string;
  password?: string;
  /** ISAPI auth: auto (default) | digest | basic */
  authMode?: AuthMode;
  /** AcsEvent HTTP method — default POST */
  eventsMethod?: EventsMethod;
  syncMode?: 'isapi' | 'simulated' | 'csv';
  driver?: 'isapi' | 'simulated' | 'csv';
  branchCode?: string;
  csvPath?: string;
};

export type BridgeConfig = {
  centralApiBaseUrl: string;
  apiBaseUrl?: string;
  tenantSlug?: string;
  activationCode?: string;
  bridgeName?: string;
  timezone?: string;
  pollIntervalSeconds: number;
  heartbeatIntervalSeconds: number;
  syncIntervalSeconds?: number;
  maxBatchSize: number;
  devices: DeviceConfig[];
  isapi?: {
    deviceInfoPath?: string;
    capabilitiesPath?: string;
    acsEventCapabilitiesPath?: string;
    eventsPath?: string;
    usersPath?: string;
  };
};

const DEFAULT_CONFIG = 'config.json';
const EXAMPLE_CONFIG = 'config.example.json';

export function resolveConfigPath(configPath?: string): string {
  return configPath ?? join(process.cwd(), DEFAULT_CONFIG);
}

export function ensureConfigExists(configPath?: string): string {
  const path = resolveConfigPath(configPath);
  if (existsSync(path)) return path;
  const example = join(process.cwd(), EXAMPLE_CONFIG);
  if (existsSync(example)) {
    copyFileSync(example, path);
    console.log(`[bridge] Created ${DEFAULT_CONFIG} from ${EXAMPLE_CONFIG}.`);
    console.log('[bridge] Edit config.json (API URL, activation code, device IP) then run again.');
    process.exit(0);
  }
  throw new Error(`Config not found: ${path}. Copy ${EXAMPLE_CONFIG} to ${DEFAULT_CONFIG}`);
}

export function loadConfig(configPath?: string): BridgeConfig {
  const path = ensureConfigExists(configPath);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

  const api =
    (process.env.AFAQ_API_URL as string | undefined) ??
    (raw.centralApiBaseUrl as string | undefined) ??
    (raw.apiBaseUrl as string | undefined) ??
    '';

  const syncSec = Number(raw.syncIntervalSeconds ?? raw.pollIntervalSeconds ?? 60);

  return {
    centralApiBaseUrl: api.replace(/\/$/, ''),
    apiBaseUrl: api.replace(/\/$/, ''),
    tenantSlug: raw.tenantSlug as string | undefined,
    activationCode: (process.env.AFAQ_ACTIVATION_CODE as string | undefined) ?? (raw.activationCode as string | undefined),
    bridgeName: raw.bridgeName as string | undefined,
    timezone: (raw.timezone as string | undefined) ?? 'UTC',
    pollIntervalSeconds: syncSec,
    heartbeatIntervalSeconds: Number(process.env.AFAQ_HEARTBEAT_SECONDS ?? raw.heartbeatIntervalSeconds ?? 120),
    syncIntervalSeconds: syncSec,
    maxBatchSize: Number(raw.maxBatchSize ?? 100),
    devices: normalizeDevices(raw.devices),
    isapi: raw.isapi as BridgeConfig['isapi'],
  };
}

function normalizeDevices(devices: unknown): DeviceConfig[] {
  if (!Array.isArray(devices)) return [];
  return devices.map((d) => {
    const row = d as Record<string, unknown>;
    const mode = (row.syncMode ?? row.driver ?? 'isapi') as DeviceConfig['syncMode'];
    const authModeRaw = String(row.authMode ?? 'auto').toLowerCase();
    const authMode: DeviceConfig['authMode'] =
      authModeRaw === 'digest' || authModeRaw === 'basic' || authModeRaw === 'auto'
        ? authModeRaw
        : 'auto';
    const eventsMethodRaw = String(row.eventsMethod ?? 'POST').toUpperCase();
    const eventsMethod: DeviceConfig['eventsMethod'] =
      eventsMethodRaw === 'GET' ? 'GET' : 'POST';
    return {
      centralDeviceId: Number(row.centralDeviceId ?? 0),
      name: row.name as string | undefined,
      vendor: row.vendor as string | undefined,
      model: row.model as string | undefined,
      localIp: row.localIp as string | undefined,
      port: row.port != null ? Number(row.port) : 80,
      username: row.username as string | undefined,
      password: row.password as string | undefined,
      authMode,
      eventsMethod,
      syncMode: mode,
      driver: mode,
      branchCode: row.branchCode as string | undefined,
      csvPath: row.csvPath as string | undefined,
    };
  });
}

export function getDataDir(): string {
  return process.env.AFAQ_BRIDGE_DATA ?? join(process.cwd(), 'data');
}

export function getMachineId(): string {
  return process.env.AFAQ_MACHINE_ID ?? hostname();
}
