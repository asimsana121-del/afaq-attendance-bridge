import { connect } from 'net';
import { loadConfig, type DeviceConfig, type BridgeConfig } from './config';
import { HikvisionIsapiDriver } from './drivers/hikvision-isapi.driver';
import type { DeviceProbeResult } from './drivers/hikvision-isapi.driver';

export type TestDeviceOptions = {
  configPath?: string;
  /** Filter by centralDeviceId */
  deviceId?: number;
};

export type TestDeviceReport = {
  device: DeviceConfig;
  tcpOk: boolean;
  probe: DeviceProbeResult | null;
};

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

export async function testDevices(options: TestDeviceOptions = {}): Promise<TestDeviceReport[]> {
  const config = loadConfig(options.configPath);
  const targets = config.devices.filter((d) => {
    if ((d.syncMode ?? 'isapi') !== 'isapi') return false;
    if (options.deviceId != null && d.centralDeviceId !== options.deviceId) return false;
    return true;
  });

  const reports: TestDeviceReport[] = [];
  for (const device of targets) {
    const port = device.port ?? 80;
    const ip = device.localIp ?? '';
    const tcpOk = ip ? await probeTcp(ip, port, 3000) : false;
    if (!tcpOk) {
      reports.push({
        device,
        tcpOk: false,
        probe: {
          diagnosis: 'DEVICE_UNREACHABLE',
          tcpOk: false,
          steps: [{ name: 'tcp', ok: false, detail: `${ip}:${port} unreachable` }],
        },
      });
      continue;
    }

    const driver = new HikvisionIsapiDriver(device, config.isapi);
    const probe = await driver.probeCapabilities();
    reports.push({ device, tcpOk: true, probe });
  }
  return reports;
}

export function formatTestDeviceOutput(reports: TestDeviceReport[]): string {
  const lines: string[] = [];
  if (reports.length === 0) {
    lines.push('No isapi devices found in config.json');
    return lines.join('\n');
  }
  for (const r of reports) {
    const id = r.device.centralDeviceId;
    const name = r.device.name ?? 'device';
    const ip = r.device.localIp ?? '?';
    lines.push(`--- device ${id} (${name}) ${ip}:${r.device.port ?? 80} ---`);
    lines.push(`TCP: ${r.tcpOk ? 'OK' : 'FAIL'}`);
    if (r.probe) {
      if (r.probe.challengeType) {
        lines.push(`ISAPI auth challenge: ${r.probe.challengeType}`);
      }
      for (const step of r.probe.steps) {
        const st = step.status != null ? ` HTTP ${step.status}` : '';
        const warn = step.warning ? ` — ${step.warning}` : '';
        const detail = step.detail ? ` (${step.detail})` : '';
        lines.push(`  ${step.name}: ${step.ok ? 'OK' : 'FAIL'}${st}${warn}${detail}`);
      }
      lines.push(`DIAGNOSIS: ${r.probe.diagnosis}`);
      if (r.probe.diagnosis === 'DEVICE_AUTH_FAILED') {
        lines.push(
          'ACTION: Check device username/password, enable ISAPI/web access, or set authMode=digest.',
        );
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function testDeviceExitCode(reports: TestDeviceReport[]): number {
  if (reports.length === 0) return 1;
  const allOk = reports.every((r) => r.probe?.diagnosis === 'DEVICE_AUTH_OK');
  return allOk ? 0 : 1;
}

/** Expose config type for callers that need isapi paths. */
export type { BridgeConfig };
