import type { DeviceConfig } from '../config';
import type { AttendanceDeviceDriver, NormalizedPunchEvent } from './attendance-device-driver';

export class SimulatedDriver implements AttendanceDeviceDriver {
  readonly name = 'simulated';

  constructor(private readonly device: DeviceConfig) {}

  async testConnection(): Promise<boolean> {
    return true;
  }

  async pullEvents(cursor: {
    lastPunchTimeUtc: string | null;
    lastEventId: string | null;
  }): Promise<NormalizedPunchEvent[]> {
    const since = cursor.lastPunchTimeUtc ? new Date(cursor.lastPunchTimeUtc).getTime() : 0;
    const now = Date.now();
    if (now - since < 30_000) return [];

    const punchTimeUtc = new Date().toISOString();
    return [
      {
        centralDeviceId: this.device.centralDeviceId,
        deviceUserId: 'SIM001',
        punchTimeUtc,
        punchTimeLocal: punchTimeUtc,
        verifyMode: 'fingerprint',
        direction: 'in',
        deviceEventId: `sim-${now}`,
        rawPayload: { simulated: true, device: this.device.name ?? 'simulated' },
      },
    ];
  }
}
