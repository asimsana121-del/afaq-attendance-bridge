const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildSourceHash } = require('../dist/crypto/source-hash');
const { nextBackoff } = require('../dist/sync/backoff');
const { BridgeDb } = require('../dist/db/bridge-store');

describe('attendance-bridge', () => {
  it('sourceHash is stable for same inputs', () => {
    const a = buildSourceHash({
      tenantId: 1,
      deviceId: 2,
      deviceUserId: 'U001',
      punchTimeUtc: '2026-07-12T10:00:00.000Z',
      verifyMode: 'fingerprint',
      deviceEventId: '99',
    });
    const b = buildSourceHash({
      tenantId: 1,
      deviceId: 2,
      deviceUserId: 'U001',
      punchTimeUtc: '2026-07-12T10:00:00.000Z',
      verifyMode: 'fingerprint',
      deviceEventId: '99',
    });
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('backoff increases on failure and resets on success', () => {
    let s = { attempt: 0, nextDelayMs: 2000 };
    s = nextBackoff(s, false);
    assert.ok(s.nextDelayMs > 2000);
    s = nextBackoff(s, true);
    assert.equal(s.attempt, 0);
    assert.equal(s.nextDelayMs, 2000);
  });

  it('bridge store persists queue with atomic write', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
    const db = new BridgeDb(dir);
    const ok = db.enqueueEvent({
      centralDeviceId: 1,
      deviceUserId: 'U1',
      punchTimeUtc: '2026-07-13T08:00:00.000Z',
      punchTimeLocal: null,
      verifyMode: 'fingerprint',
      direction: 'in',
      deviceEventId: '1',
      sourceHash: 'abc123',
      rawPayload: null,
    });
    assert.equal(ok, true);
    assert.equal(db.queueDepth(), 1);
    const db2 = new BridgeDb(dir);
    assert.equal(db2.queueDepth(), 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
