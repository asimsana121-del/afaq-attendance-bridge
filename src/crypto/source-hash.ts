import { createHash } from 'crypto';

export function buildSourceHash(parts: {
  tenantId: number;
  deviceId: number;
  deviceUserId: string;
  punchTimeUtc: string | Date;
  verifyMode: string;
  deviceEventId?: string | null;
}): string {
  const punch =
    parts.punchTimeUtc instanceof Date
      ? parts.punchTimeUtc.toISOString()
      : new Date(parts.punchTimeUtc).toISOString();
  const raw = [
    parts.tenantId,
    parts.deviceId,
    parts.deviceUserId,
    punch,
    parts.verifyMode,
    parts.deviceEventId ?? '',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}
