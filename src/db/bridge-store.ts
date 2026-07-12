import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';

export type QueuedEvent = {
  id: number;
  centralDeviceId: number;
  deviceUserId: string;
  punchTimeUtc: string;
  punchTimeLocal: string | null;
  verifyMode: string;
  direction: string;
  deviceEventId: string | null;
  sourceHash: string;
  rawPayload: string | null;
};

type Store = {
  status: Record<string, string>;
  cursors: Record<string, { lastPunchTimeUtc: string | null; lastEventId: string | null }>;
  queue: QueuedEvent[];
  sentHashes: string[];
  errors: Array<{ context: string; message: string; createdAt: string }>;
  nextId: number;
};

const MAX_SENT_HASHES = 50_000;

function emptyStore(): Store {
  return { status: {}, cursors: {}, queue: [], sentHashes: [], errors: [], nextId: 1 };
}

export class BridgeDb {
  private path: string;
  private data: Store;

  constructor(dataDir: string) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    this.path = join(dataDir, 'bridge-store.json');
    this.data = this.load();
  }

  private load(): Store {
    if (!existsSync(this.path)) return emptyStore();
    try {
      return { ...emptyStore(), ...JSON.parse(readFileSync(this.path, 'utf8')) };
    } catch {
      return emptyStore();
    }
  }

  private save(): void {
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }

  getStatus(key: string): string | null {
    return this.data.status[key] ?? null;
  }

  setStatus(key: string, value: string): void {
    this.data.status[key] = value;
    this.save();
  }

  getCursor(centralDeviceId: number): { lastPunchTimeUtc: string | null; lastEventId: string | null } {
    return this.data.cursors[String(centralDeviceId)] ?? { lastPunchTimeUtc: null, lastEventId: null };
  }

  setCursor(centralDeviceId: number, lastPunchTimeUtc: string, lastEventId: string | null): void {
    this.data.cursors[String(centralDeviceId)] = { lastPunchTimeUtc, lastEventId };
    this.save();
  }

  enqueueEvent(event: Omit<QueuedEvent, 'id'>): boolean {
    if (this.data.queue.some((q) => q.sourceHash === event.sourceHash)) return false;
    if (this.data.sentHashes.includes(event.sourceHash)) return false;
    this.data.queue.push({ ...event, id: this.data.nextId++ });
    this.save();
    return true;
  }

  listQueued(limit = 100): QueuedEvent[] {
    return this.data.queue.slice(0, limit);
  }

  markSent(ids: number[], sourceHashes: string[]): void {
    const idSet = new Set(ids);
    this.data.queue = this.data.queue.filter((q) => !idSet.has(q.id));
    for (const h of sourceHashes) {
      if (!this.data.sentHashes.includes(h)) this.data.sentHashes.push(h);
    }
    if (this.data.sentHashes.length > MAX_SENT_HASHES) {
      this.data.sentHashes = this.data.sentHashes.slice(-MAX_SENT_HASHES);
    }
    this.save();
  }

  logError(context: string, message: string): void {
    const safe = message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/password["\s:]+[^\s"]+/gi, 'password [REDACTED]');
    this.data.errors.push({ context, message: safe, createdAt: new Date().toISOString() });
    if (this.data.errors.length > 200) this.data.errors = this.data.errors.slice(-200);
    this.save();
  }

  queueDepth(): number {
    return this.data.queue.length;
  }

  recentErrors(limit = 10): Array<{ context: string; message: string; createdAt: string }> {
    return this.data.errors.slice(-limit);
  }
}
