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

  it('validateCentralApiUrl rejects BFF URLs', () => {
    const { validateCentralApiUrl } = require('../dist/api-url-validation');
    const result = validateCentralApiUrl('https://tenant.example.com/api/bff');
    assert.ok(result.errors.some((e) => /web app\/BFF/i.test(e)));
  });

  it('validateCentralApiUrl requires /v1 suffix', () => {
    const { validateCentralApiUrl } = require('../dist/api-url-validation');
    const result = validateCentralApiUrl('https://tenant.example.com');
    assert.ok(result.errors.some((e) => /\/v1/i.test(e)));
  });

  it('validateCentralApiUrl warns on tenant slug host for tofan.dev', () => {
    const { validateCentralApiUrl } = require('../dist/api-url-validation');
    const result = validateCentralApiUrl('https://tfn.tofan.dev/v1');
    assert.ok(result.warnings.some((w) => /api\.tofan\.dev/i.test(w)));
  });

  it('validateCentralApiUrl accepts api.tofan.dev without warning', () => {
    const { validateCentralApiUrl } = require('../dist/api-url-validation');
    const result = validateCentralApiUrl('https://api.tofan.dev/v1');
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('formatBridgeApiError detects CSRF misconfiguration', () => {
    const { formatBridgeApiError } = require('../dist/central-api-client');
    const msg = formatBridgeApiError(
      403,
      { message: 'CSRF token missing or invalid' },
      'https://tenant.example.com/v1',
      'fallback',
    );
    assert.match(msg, /browser-protected endpoint/i);
    assert.match(msg, /centralApiBaseUrl/i);
    assert.match(msg, /\/v1\/hrm\/attendance\/bridges\/activate/);
  });

  it('central-api-client uses credentials omit', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'central-api-client.ts'), 'utf8');
    assert.match(src, /credentials:\s*'omit'/);
  });

  it('selectQop prefers auth from auth,auth-int', () => {
    const { selectQop, parseWwwAuthenticateDigest, detectChallengeType, digestUriVariants, buildDigestAuthorization } =
      require('../dist/drivers/digest-auth');
    assert.equal(selectQop('auth,auth-int'), 'auth');
    assert.equal(selectQop('"auth,auth-int"'), 'auth');
    assert.equal(detectChallengeType('Digest realm="IP Camera"'), 'Digest');
    assert.equal(detectChallengeType('Basic realm="x"'), 'Basic');
    const params = parseWwwAuthenticateDigest(
      'Digest realm="IPCamera", nonce="abc123", qop="auth,auth-int", opaque="deadbeef"',
    );
    assert.equal(params.realm, 'IPCamera');
    assert.equal(params.nonce, 'abc123');
    assert.equal(params.opaque, 'deadbeef');
    assert.equal(selectQop(params.qop), 'auth');
    const variants = digestUriVariants('/ISAPI/AccessControl/AcsEvent?format=json');
    assert.equal(variants[0].variant, 'full');
    assert.equal(variants[1].variant, 'path-only');
    assert.equal(variants[1].uri, '/ISAPI/AccessControl/AcsEvent');
    const header = buildDigestAuthorization({
      wwwAuthenticate: 'Digest realm="R", nonce="N", qop="auth,auth-int", opaque="O"',
      method: 'POST',
      uri: '/ISAPI/AccessControl/AcsEvent?format=json',
      username: 'admin',
      password: 'secret',
    });
    assert.match(header, /^Digest /);
    assert.match(header, /qop=auth/);
    assert.match(header, /opaque="O"/);
    assert.doesNotMatch(header, /secret/);
  });

  it('main CLI exposes test-device command', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
    assert.match(src, /test-device/);
    assert.match(src, /cmdTestDevice/);
  });

  it('test-device diagnosis codes are defined', () => {
    const testSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'test-device.ts'), 'utf8');
    const driverSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'drivers', 'hikvision-isapi.driver.ts'), 'utf8');
    assert.match(testSrc, /DEVICE_AUTH_OK/);
    assert.match(testSrc, /DEVICE_AUTH_FAILED/);
    assert.match(driverSrc, /DEVICE_ENDPOINT_UNSUPPORTED/);
    assert.match(driverSrc, /DEVICE_REACHABLE_BUT_EVENTS_FAILED/);
  });

  it('hikvision pullEvents does not throw on HTTP errors (service safe)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'drivers', 'hikvision-isapi.driver.ts'), 'utf8');
    assert.match(src, /return \[\]/);
    assert.match(src, /eventsMethod/);
    assert.match(src, /probeCapabilities/);
  });

  it('sync-runner maps device auth errors to heartbeat status without exiting loop', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'sync', 'sync-runner.ts'), 'utf8');
    assert.match(src, /deviceStatus\.set\(deviceId, 'error'\)/);
    assert.match(src, /for \(;;\)/);
    assert.match(src, /getLastDeviceError/);
  });

  it('package version is 0.1.6', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(pkg.version, '0.1.6');
  });
  it('main registers crash handlers and SERVICE_BOOT_START', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
    assert.match(src, /SERVICE_BOOT_START/);
    assert.match(src, /uncaughtException/);
    assert.match(src, /unhandledRejection/);
  });

  it('config.example has authMode auto and eventsMethod POST', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8'));
    assert.equal(cfg.devices[0].authMode, 'auto');
    assert.equal(cfg.devices[0].eventsMethod, 'POST');
    assert.equal(cfg.devices[0].model, 'DS-K1A802AEF-B');
    assert.ok(cfg.isapi.acsEventCapabilitiesPath);
  });
});
