/**
 * Minimal digest-auth fetch for Hikvision ISAPI without extra dependencies.
 */
export class DigestAuthClient {
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly baseUrl: string,
  ) {}

  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const first = await fetch(url, init);
    if (first.status !== 401) return first;
    const www = first.headers.get('www-authenticate') ?? '';
    const auth = this.buildDigestHeader(www, init?.method ?? 'GET', path);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', auth);
    return fetch(url, { ...init, headers });
  }

  private buildDigestHeader(www: string, method: string, uri: string): string {
    const params: Record<string, string> = {};
    for (const part of www.replace(/^Digest\s+/i, '').split(',')) {
      const [k, v] = part.split('=');
      if (k && v) params[k.trim()] = v.trim().replace(/^"|"$/g, '');
    }
    const nc = '00000001';
    const cnonce = Math.random().toString(36).slice(2, 10);
    const realm = params.realm ?? '';
    const nonce = params.nonce ?? '';
    const qop = params.qop ?? 'auth';
    const ha1 = md5(`${this.username}:${realm}:${this.password}`);
    const ha2 = md5(`${method}:${uri}`);
    const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    return `Digest username="${this.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
  }
}

function md5(input: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('md5').update(input).digest('hex');
}
