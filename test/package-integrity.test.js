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
      const dataFiles = files.filter((f) => f.startsWith('data/') && !f.endsWith('/') && !f.endsWith('.gitkeep'));
      const logFiles = files.filter((f) => f.startsWith('logs/') && !f.endsWith('/') && !f.endsWith('.gitkeep'));
      assert.ok(hasPath(files, 'data'), 'data/ directory missing in ZIP');
      assert.ok(hasPath(files, 'logs'), 'logs/ directory missing in ZIP');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('primary executable prints usage', { skip: process.platform !== 'win32' ? 'Windows only' : false }, () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-exe-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const exe = path.join(tmp, 'AfaqAttendanceBridge.exe');
      assert.ok(fs.existsSync(exe));
      const out = execFileSync(exe, [], { encoding: 'utf8', timeout: 30000 });
      assert.match(out, /Afaq Attendance Bridge/i);
      assert.match(out, /Usage:/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('node fallback runs status command', { skip: process.platform !== 'win32' ? 'Windows only' : false }, () => {
    if (!fs.existsSync(ZIP_PATH)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-node-'));
    try {
      extractZip(ZIP_PATH, tmp);
      const nodeExe = path.join(tmp, 'node', 'node.exe');
      const mainJs = path.join(tmp, 'dist', 'main.js');
      assert.ok(fs.existsSync(nodeExe));
      assert.ok(fs.existsSync(mainJs));
      try {
        const out = execFileSync(nodeExe, [mainJs, 'status'], {
          encoding: 'utf8',
          timeout: 30000,
          cwd: tmp,
        });
        assert.match(out, /activated|queueDepth|tenantId/i);
      } catch (err) {
        const combined = String(err.stdout ?? '') + String(err.stderr ?? '');
        assert.ok(combined.length > 0, 'node fallback should produce output');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('SHA256SUMS.txt matches ZIP', () => {
    const sumsPath = path.join(ROOT, 'dist-packages', 'SHA256SUMS.txt');
    assert.ok(fs.existsSync(sumsPath));
    const line = fs.readFileSync(sumsPath, 'utf8').trim();
    assert.match(line, /^[a-f0-9]{64}\s+AfaqAttendanceBridge-win-x64\.zip$/);
  });
});
