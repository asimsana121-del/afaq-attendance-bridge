import type { BridgeConfig, DeviceConfig } from '../config';
import { CsvImportDriver } from './csv-import.driver';
import { HikvisionIsapiDriver } from './hikvision-isapi.driver';
import { SimulatedDriver } from './simulated.driver';
import type { AttendanceDeviceDriver } from './attendance-device-driver';

function resolveDriver(device: DeviceConfig): 'isapi' | 'simulated' | 'csv' {
  const mode = device.syncMode ?? device.driver ?? 'isapi';
  if (mode === 'csv') return 'csv';
  if (mode === 'simulated') return 'simulated';
  return 'isapi';
}

export function createDriver(device: DeviceConfig, config: BridgeConfig): AttendanceDeviceDriver {
  switch (resolveDriver(device)) {
    case 'isapi':
      return new HikvisionIsapiDriver(device, config.isapi);
    case 'csv':
      return new CsvImportDriver(device);
    case 'simulated':
    default:
      return new SimulatedDriver(device);
  }
}
