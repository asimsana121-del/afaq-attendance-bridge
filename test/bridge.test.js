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

  it('validate-config rejects missing config.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-validate-'));
    const { validateConfig, formatValidateOutput } = require('../dist/validate-config');
    const result = await validateConfig({ cwd: dir });
    assert.equal(result.ok, false);
    assert.match(formatValidateOutput(result), /config\.json not found/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('validate-config accepts simulated device config', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-validate-'));
    const config = {
      centralApiBaseUrl: 'https://demo.example.com/v1',
      tenantSlug: 'tfn',
      timezone: 'UTC',
      syncIntervalSeconds: 60,
      devices: [
        {
          centralDeviceId: 1,
          syncMode: 'simulated',
          branchCode: 'MAIN',
        },
      ],
    };
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
    const { validateConfig, formatValidateOutput } = require('../dist/validate-config');
    const result = await validateConfig({ cwd: dir });
    assert.equal(result.ok, true, formatValidateOutput(result));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('validate-config rejects invalid branch and isapi fields', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-validate-'));
    const config = {
      centralApiBaseUrl: 'not-a-url',
      tenantSlug: '',
      syncIntervalSeconds: 0,
      devices: [],
    };
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
    const { validateConfig } = require('../dist/validate-config');
    const result = await validateConfig({ cwd: dir });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 3);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('main CLI exposes validate-config command', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
    assert.match(src, /validate-config/);
    assert.match(src, /cmdValidateConfig/);
  });
});
