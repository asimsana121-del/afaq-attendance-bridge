#!/usr/bin/env node
import { loadConfig, getDataDir, getMachineId } from './config';
import { BridgeDb } from './db/bridge-store';
import { createClientFromConfig } from './central-api-client';
import { SyncRunner } from './sync/sync-runner';
import { formatValidateOutput, validateConfig } from './validate-config';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--code' && argv[i + 1]) out.code = argv[++i];
    if (argv[i] === '--api' && argv[i + 1]) out.api = argv[++i];
    if (argv[i] === '--config' && argv[i + 1]) out.config = argv[++i];
    if (argv[i] === '--deep') out.deep = true;
  }
  return out;
}

async function activateBridge(config: ReturnType<typeof loadConfig>, args: Record<string, string>): Promise<BridgeDb> {
  const code = args.code ?? config.activationCode;
  if (!code) throw new Error('Provide activationCode in config.json or --code <activation-code>');

  const apiBase = args.api ?? config.centralApiBaseUrl;
  if (!apiBase) throw new Error('Set centralApiBaseUrl in config.json or --api https://host/v1');

  const temp = createClientFromConfig({ ...config, centralApiBaseUrl: apiBase }, 'pending');
  const result = await temp.activate(code, config.bridgeName);
  const db = new BridgeDb(getDataDir());
  db.setStatus('bridgeToken', result.bridgeToken);
  db.setStatus('tenantId', String(result.tenantId));
  db.setStatus('bridgeId', result.bridgeId != null ? String(result.bridgeId) : '');
  db.setStatus('machineId', getMachineId());
  db.setStatus('apiBaseUrl', apiBase.replace(/\/$/, ''));
  console.log('Bridge activated successfully');
  console.log(`  Bridge ID: ${result.bridgeId ?? '(assigned)'}`);
  console.log(`  Tenant ID: ${result.tenantId}`);
  console.log(`  Central API: ${apiBase.replace(/\/$/, '')}`);
  console.log(`  Devices in config: ${config.devices.length}`);
  return db;
}

async function cmdActivate(args: Record<string, string>): Promise<void> {
  const config = loadConfig(args.config);
  await activateBridge(config, args);
}

async function cmdRun(args: Record<string, string>): Promise<void> {
  const config = loadConfig(args.config);
  const db = new BridgeDb(getDataDir());
  let token = db.getStatus('bridgeToken');
  let tenantId = Number(db.getStatus('tenantId'));

  if (!token || !Number.isFinite(tenantId)) {
    await activateBridge(config, args);
    token = db.getStatus('bridgeToken');
    tenantId = Number(db.getStatus('tenantId'));
  }

  if (!token || !Number.isFinite(tenantId)) throw new Error('Bridge activation failed');

  const apiBase = db.getStatus('apiBaseUrl') ?? config.centralApiBaseUrl;
  const client = createClientFromConfig({ ...config, centralApiBaseUrl: apiBase }, token);
  const runner = new SyncRunner(config, db, client, tenantId);
  await runner.loop();
}

async function cmdStatus(): Promise<void> {
  const db = new BridgeDb(getDataDir());
  console.log(JSON.stringify({
    tenantId: db.getStatus('tenantId'),
    bridgeId: db.getStatus('bridgeId'),
    machineId: db.getStatus('machineId'),
    apiBaseUrl: db.getStatus('apiBaseUrl'),
    queueDepth: db.queueDepth(),
    activated: Boolean(db.getStatus('bridgeToken')),
    recentErrors: db.recentErrors(5),
  }, null, 2));
}

async function cmdValidateConfig(args: Record<string, string | boolean>): Promise<void> {
  const result = await validateConfig({
    configPath: typeof args.config === 'string' ? args.config : undefined,
    deep: Boolean(args.deep),
  });
  console.log(formatValidateOutput(result));
  if (!result.ok) process.exit(1);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  const args = parseArgs(rest);
  switch (command) {
    case 'activate':
      await cmdActivate(args as Record<string, string>);
      break;
    case 'run':
      await cmdRun(args as Record<string, string>);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'validate-config':
      await cmdValidateConfig(args);
      break;
    default:
      console.log(`Afaq Attendance Bridge

Usage:
  AfaqAttendanceBridge.exe activate [--code <code>] [--api https://host/v1]
  AfaqAttendanceBridge.exe run
  AfaqAttendanceBridge.exe status
  AfaqAttendanceBridge.exe validate-config [--deep] [--config path]`);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  const msg = String(err.message ?? err).replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  console.error('[bridge] fatal:', msg);
  process.exit(1);
});
