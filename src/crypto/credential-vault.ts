import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const VAULT_FILE = 'credential-vault.dat';

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'afaq-attendance-bridge', 32);
}

export function encryptSecret(plain: string, machineSecret: string): string {
  const key = deriveKey(machineSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string, machineSecret: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = deriveKey(machineSecret);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function loadVault(dataDir: string, machineSecret: string): Record<string, string> {
  const path = join(dataDir, VAULT_FILE);
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = decryptSecret(v, machineSecret);
  }
  return out;
}

export function saveVault(dataDir: string, machineSecret: string, secrets: Record<string, string>): void {
  const path = join(dataDir, VAULT_FILE);
  const enc: Record<string, string> = {};
  for (const [k, v] of Object.entries(secrets)) {
    enc[k] = encryptSecret(v, machineSecret);
  }
  writeFileSync(path, JSON.stringify(enc, null, 2), 'utf8');
}
