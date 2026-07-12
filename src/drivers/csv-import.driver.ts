import { readFileSync, existsSync } from 'fs';
import type { DeviceConfig } from '../config';
import type { AttendanceDeviceDriver, NormalizedPunchEvent } from './attendance-device-driver';

type CsvRow = {
  deviceUserId: string;
  punchTimeUtc: string;
  verifyMode?: string;
  direction?: string;
};

export class CsvImportDriver implements AttendanceDeviceDriver {
  readonly name = 'csv';

  constructor(private readonly device: DeviceConfig) {}

  async testConnection(): Promise<boolean> {
    return Boolean(this.device.csvPath && existsSync(this.device.csvPath));
  }

  async pullEvents(cursor: {
    lastPunchTimeUtc: string | null;
  }): Promise<NormalizedPunchEvent[]> {
    if (!this.device.csvPath || !existsSync(this.device.csvPath)) return [];
    const text = readFileSync(this.device.csvPath, 'utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const since = cursor.lastPunchTimeUtc ? new Date(cursor.lastPunchTimeUtc).getTime() : 0;
    const events: NormalizedPunchEvent[] = [];

    for (let i = 1; i < lines.length; i++) {
      const [deviceUserId, punchTimeUtc, verifyMode, direction] = lines[i].split(',');
      if (!deviceUserId || !punchTimeUtc) continue;
      const ts = new Date(punchTimeUtc).getTime();
      if (Number.isNaN(ts) || ts <= since) continue;
      events.push({
        centralDeviceId: this.device.centralDeviceId,
        deviceUserId: deviceUserId.trim(),
        punchTimeUtc: new Date(punchTimeUtc).toISOString(),
        verifyMode: (verifyMode ?? 'unknown').trim(),
        direction: (direction ?? 'unknown').trim(),
        rawPayload: { source: 'csv', line: i + 1 },
      });
    }
    return events.sort((a, b) => a.punchTimeUtc.localeCompare(b.punchTimeUtc));
  }
}
