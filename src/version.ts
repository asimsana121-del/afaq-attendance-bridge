import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

let cached: string | null = null;

export function getBridgeVersion(): string {
  if (cached) return cached;
  const candidates = [
    join(process.cwd(), 'package.json'),
    join(__dirname, '..', 'package.json'),
    join(__dirname, 'package.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf8')) as { version?: string };
      cached = pkg.version ?? '0.1.0';
      return cached;
    } catch {
      /* try next */
    }
  }
  cached = process.env.AFAQ_BRIDGE_VERSION ?? '0.1.0';
  return cached;
}
