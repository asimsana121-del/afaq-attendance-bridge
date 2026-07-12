export type NormalizedPunchEvent = {
  centralDeviceId: number;
  deviceUserId: string;
  punchTimeUtc: string;
  punchTimeLocal?: string;
  verifyMode: string;
  direction: string;
  deviceEventId?: string;
  rawPayload?: Record<string, unknown>;
};

export interface AttendanceDeviceDriver {
  readonly name: string;
  testConnection(): Promise<boolean>;
  fetchUsers?(): Promise<Array<{ deviceUserId: string; name?: string }>>;
  pullEvents(cursor: {
    lastPunchTimeUtc: string | null;
    lastEventId: string | null;
  }): Promise<NormalizedPunchEvent[]>;
}
