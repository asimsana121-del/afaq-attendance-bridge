/**
 * Hikvision ISAPI HTTP auth: Digest (primary) and Basic, with auto challenge detection.
 * Never logs passwords.
 */

export type AuthMode = 'auto' | 'digest' | 'basic';
export type AuthChallengeType = 'Digest' | 'Basic' | 'none';

export type AuthFetchMeta = {
  status: number;
  challengeType: AuthChallengeType;
  authAttempted: boolean;
  usedUriVariant?: 'full' | 'path-only';
};

export type AuthFetchResult = {
  response: Response;
  meta: AuthFetchMeta;
};

export function detectChallengeType(wwwAuthenticate: string | null): AuthChallengeType {
  if (!wwwAuthenticate || !wwwAuthenticate.trim()) return 'none';
  const lower = wwwAuthenticate.toLowerCase();
  if (lower.includes('digest')) return 'Digest';
  if (lower.includes('basic')) return 'Basic';
  return 'none';
}

/** Parse Digest challenge parameters (handles quoted values). */
export function parseWwwAuthenticateDigest(www: string): Record<string, string> {
  const params: Record<string, string> = {};
  const stripped = www.replace(/^Digest\s+/i, '').trim();
  const re = /([a-zA-Z0-9_-]+)=("(?:[^"\\]|\\.)*"|[^,\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const key = m[1].trim().toLowerCase();
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    params[key] = val;
  }
  return params;
}

/** Prefer `auth` when device advertises `auth,auth-int`. */
export function selectQop(qopRaw: string | undefined): string {
  if (!qopRaw) return 'auth';
  const cleaned = qopRaw.replace(/^"+|"+$/g, '').trim();
  const parts = cleaned.split(',').map((p) => p.trim().toLowerCase().replace(/^"+|"+$/g, '')).filter(Boolean);
  if (parts.includes('auth')) return 'auth';
  return parts[0] ?? 'auth';
}

export function digestUriVariants(path: string): Array<{ uri: string; variant: 'full' | 'path-only' }> {
  const q = path.indexOf('?');
  const pathOnly = q >= 0 ? path.slice(0, q) : path;
  const variants: Array<{ uri: string; variant: 'full' | 'path-only' }> = [
    { uri: path, variant: 'full' },
  ];
  if (pathOnly !== path) {
    variants.push({ uri: pathOnly, variant: 'path-only' });
  }
  return variants;
}

export function buildDigestAuthorization(opts: {
  wwwAuthenticate: string;
  method: string;
  uri: string;
  username: string;
  password: string;
}): string {
  const params = parseWwwAuthenticateDigest(opts.wwwAuthenticate);
  const nc = '00000001';
  const cnonce = Math.random().toString(36).slice(2, 14);
  const realm = params.realm ?? '';
  const nonce = params.nonce ?? '';
  const qop = selectQop(params.qop);
  const opaque = params.opaque;
  const ha1 = md5(`${opts.username}:${realm}:${opts.password}`);
  const ha2 = md5(`${opts.method.toUpperCase()}:${opts.uri}`);
  const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  let header =
    `Digest username="${opts.username}", realm="${realm}", nonce="${nonce}", uri="${opts.uri}", ` +
    `qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
  if (opaque) {
    header += `, opaque="${opaque}"`;
  }
  return header;
}

function buildBasicAuthorization(username: string, password: string): string {
  const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

export class DigestAuthClient {
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly baseUrl: string,
    private readonly authMode: AuthMode = 'auto',
  ) {}

  /** Convenience wrapper matching previous API. */
  async fetch(path: string, init?: RequestInit): Promise<Response> {
    const result = await this.fetchWithAuth(path, init);
    return result.response;
  }

  async fetchWithAuth(path: string, init?: RequestInit): Promise<AuthFetchResult> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const method = (init?.method ?? 'GET').toUpperCase();
    const first = await fetch(url, init);

    if (first.status !== 401) {
      return {
        response: first,
        meta: { status: first.status, challengeType: 'none', authAttempted: false },
      };
    }

    const www = first.headers.get('www-authenticate') ?? '';
    const challengeType = detectChallengeType(www);
    const scheme = this.resolveScheme(challengeType);

    if (!scheme) {
      return {
        response: first,
        meta: { status: 401, challengeType, authAttempted: false },
      };
    }

    if (scheme === 'basic') {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', buildBasicAuthorization(this.username, this.password));
      const second = await fetch(url, { ...init, headers });
      return {
        response: second,
        meta: {
          status: second.status,
          challengeType: challengeType === 'none' ? 'Basic' : challengeType,
          authAttempted: true,
        },
      };
    }

    // Digest: try full URI then path-only if still 401
    let lastResponse = first;
    let usedVariant: 'full' | 'path-only' = 'full';
    for (const { uri, variant } of digestUriVariants(path)) {
      const headers = new Headers(init?.headers);
      headers.set(
        'Authorization',
        buildDigestAuthorization({
          wwwAuthenticate: www,
          method,
          uri,
          username: this.username,
          password: this.password,
        }),
      );
      const attempt = await fetch(url, { ...init, headers });
      lastResponse = attempt;
      usedVariant = variant;
      if (attempt.status !== 401) {
        return {
          response: attempt,
          meta: {
            status: attempt.status,
            challengeType: 'Digest',
            authAttempted: true,
            usedUriVariant: variant,
          },
        };
      }
    }

    return {
      response: lastResponse,
      meta: {
        status: lastResponse.status,
        challengeType: 'Digest',
        authAttempted: true,
        usedUriVariant: usedVariant,
      },
    };
  }

  private resolveScheme(challengeType: AuthChallengeType): 'digest' | 'basic' | null {
    if (this.authMode === 'digest') return 'digest';
    if (this.authMode === 'basic') return 'basic';
    // auto
    if (challengeType === 'Digest') return 'digest';
    if (challengeType === 'Basic') return 'basic';
    // No challenge header — Hikvision typically uses Digest
    return 'digest';
  }
}

function md5(input: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('md5').update(input).digest('hex');
}

/** Safe diagnostic line — never includes password. */
export function formatAuthDiag(opts: {
  deviceIp?: string;
  endpoint: string;
  status: number;
  challengeType: AuthChallengeType;
}): string {
  const ip = opts.deviceIp ?? '?';
  return `[isapi] ${ip} ${opts.endpoint} HTTP ${opts.status} auth=${opts.challengeType}`;
}
