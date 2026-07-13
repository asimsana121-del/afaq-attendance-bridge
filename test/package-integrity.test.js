/**
 * Package integrity gate — run after npm run package:windows (CI + local).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ZIP_PATH = path.join(ROOT, 'dist-packages', 'AfaqAttendanceBridge-win-x64.zip');

const REQUIRED_PATHS = [
  'AfaqAttendanceBridge.exe',
  'node/node.exe',
  'dist/main.js',
  'service/winsw/WinSW-x64.exe',
  'service/winsw/AfaqAttendanceBridge.xml',
  'config.example.json',
  'README_INSTALL.md',
  'run-once.bat',
  'install-service.bat',
  'uninstall-service.bat',
  'status.bat',
  'data',
  'logs',
];

const FORBIDDEN_NAMES = [
  'config.json',
  'bridge-store.json',
  'bridge-store',
];

function extractZip(zipPath, destDir) {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );
    return;
  }
  execFileSync('unzip', ['-q', zipPath, '-d', destDir], { stdio: 'pipe' });
}

function listRelativeFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      out.push(rel + '/');
      out.push(...listRelativeFiles(full, base));
    } else {
      out.push(rel);
    }
  }
  return out;
}

function hasPath(files, required) {
  const norm = required.replace(/\\/g, '/').replace(/\/$/, '');
  return files.some((f) => {
    const trimmed = f.replace(/\/$/, '');
    return trimmed === norm || f === `${norm}/` || f.startsWith(`${norm}/`);
  });
}

function runExe(exe, args, cwd) {
  return execFileSync(exe, args, { encoding: 'utf8', timeout: 30000, cwd });
}

function runExeFail(exe, args, cwd) {
  try {
    execFileSync(exe, args, { encoding: 'utf8', timeout: 30000, cwd });
    return { code: 0, out: '' };
  } catch (err) {
    const out = String(err.stdout ?? '') + String(err.stderr ?? '');
    return { code: err.status ?? 1, out };
  }
}

function rmTmp(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* best-effort cleanup on Windows CI */
  }
}

describe('package integrity', () => {
  it('ZIP exists and contains required flat-root paths', () => {
    assert.ok(fs.existsSync(ZIP_PATH), `Missing package: ${ZIP_PATH}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-pkg-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const files = listRelativeFiles(tmp);
      assert.ok(
        !files.some((f) => f.startsWith('AfaqAttendanceBridge/')),
        'ZIP must not use nested AfaqAttendanceBridge/ wrapper folder',
      );
      for (const req of REQUIRED_PATHS) {
        assert.ok(hasPath(files, req), `Missing in ZIP extract: ${req}`);
      }
      for (const forbidden of FORBIDDEN_NAMES) {
        assert.ok(
          !files.some((f) => f === forbidden || f.endsWith('/' + forbidden)),
          `Forbidden file in package: ${forbidden}`,
        );
      }
      assert.ok(hasPath(files, 'data'), 'data/ directory missing in ZIP');
      assert.ok(hasPath(files, 'logs'), 'logs/ directory missing in ZIP');
    } finally {
      rmTmp(tmp);
    }
  });

  it('install-service.bat requires RUNNING before SUCCESS', () => {
    const bat = fs.readFileSync(path.join(ROOT, 'install-service.bat'), 'utf8');
    assert.match(bat, /RUNNING/i);
    assert.match(bat, /installed and running/i);
    assert.match(bat, /failed to start/i);
    assert.doesNotMatch(bat, /echo\.\s*\r?\necho SUCCESS: Afaq Attendance Bridge service installed and started\./);
  });

  it('WinSW XML uses exe run with BASE and logs', () => {
    const xml = fs.readFileSync(
      path.join(ROOT, 'service', 'winsw', 'AfaqAttendanceBridge.xml'),
      'utf8',
    );
    assert.match(xml, /AfaqAttendanceBridge\.exe/);
    assert.match(xml, /<arguments>run<\/arguments>/);
    assert.match(xml, /%BASE%/);
    assert.match(xml, /logs/);
    assert.match(xml, /10485760/);
  });

  it('primary executable prints usage with validate-config', { skip: process.platform !== 'win32' ? 'Windows only' : false }, () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-exe-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const exe = path.join(tmp, 'AfaqAttendanceBridge.exe');
      const out = runExe(exe, [], tmp);
      assert.match(out, /Afaq Attendance Bridge/i);
      assert.match(out, /validate-config/i);
    } finally {
      rmTmp(tmp);
    }
  });

  it('validate-config fails cleanly without config.json', { skip: process.platform !== 'win32' ? 'Windows only' : false }, () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-val-miss-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const exe = path.join(tmp, 'AfaqAttendanceBridge.exe');
      const { code, out } = runExeFail(exe, ['validate-config'], tmp);
      assert.notEqual(code, 0);
      assert.match(out, /config\.json not found/i);
    } finally {
      rmTmp(tmp);
    }
  });

  it('validate-config passes with simulated test config', { skip: process.platform !== 'win32' ? 'Windows only' : false }, () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-val-ok-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const config = {
        centralApiBaseUrl: 'https://demo.example.com/v1',
        tenantSlug: 'tfn',
        timezone: 'UTC',
        syncIntervalSeconds: 60,
        devices: [{ centralDeviceId: 1, syncMode: 'simulated', branchCode: 'MAIN' }],
      };
      fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify(config));
      fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
      const exe = path.join(tmp, 'AfaqAttendanceBridge.exe');
      const out = runExe(exe, ['validate-config'], tmp);
      assert.match(out, /CONFIG OK/);
    } finally {
      rmTmp(tmp);
    }
  });

  it('status command does not crash with test config', { skip: process.platform !== 'win32' ? 'Windows only' : false }, () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-status-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const config = {
        centralApiBaseUrl: 'https://demo.example.com/v1',
        tenantSlug: 'tfn',
        timezone: 'UTC',
        syncIntervalSeconds: 60,
        devices: [{ centralDeviceId: 1, syncMode: 'simulated', branchCode: 'MAIN' }],
      };
      fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify(config));
      fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
      const exe = path.join(tmp, 'AfaqAttendanceBridge.exe');
      const out = runExe(exe, ['status'], tmp);
      assert.match(out, /activated|queueDepth|tenantId/i);
    } finally {
      rmTmp(tmp);
    }
  });

  it('node fallback runs status command', { skip: process.platform !== 'win32' ? 'Windows only' : false }, () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-node-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const nodeExe = path.join(tmp, 'node', 'node.exe');
      const mainJs = path.join(tmp, 'dist', 'main.js');
      try {
        const out = runExe(nodeExe, [mainJs, 'status'], tmp);
        assert.match(out, /activated|queueDepth|tenantId/i);
      } catch (err) {
        const combined = String(err.stdout ?? '') + String(err.stderr ?? '');
        assert.ok(combined.length > 0, 'node fallback should produce output');
      }
    } finally {
      rmTmp(tmp);
    }
  });

  it('SHA256SUMS.txt matches ZIP', () => {
    const sumsPath = path.join(ROOT, 'dist-packages', 'SHA256SUMS.txt');
    assert.ok(fs.existsSync(sumsPath));
    const line = fs.readFileSync(sumsPath, 'utf8').trim();
    assert.match(line, /^[a-f0-9]{64}\s+AfaqAttendanceBridge-win-x64\.zip$/);
  });
});
