const BRIDGE_ACTIVATE_SUFFIX = '/hrm/attendance/bridges/activate';

export function redactApiBaseUrl(apiBaseUrl: string): string {
  try {
    const u = new URL(apiBaseUrl.replace(/\/$/, ''));
    return `${u.protocol}//${u.host}/v1`;
  } catch {
    return apiBaseUrl.replace(/\/$/, '');
  }
}

export function buildActivateUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}${BRIDGE_ACTIVATE_SUFFIX}`;
}

export function validateCentralApiUrl(apiBaseUrl: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = String(apiBaseUrl ?? '').trim();
  if (!raw) return { errors, warnings };

  const lower = raw.toLowerCase();
  if (lower.includes('/api/bff')) {
    errors.push(
      'ERROR: centralApiBaseUrl appears to point to the web app/BFF. Use the API base URL (e.g. https://api.tofan.dev/v1).',
    );
  }
  if (lower.includes('/app/')) {
    errors.push(
      'ERROR: centralApiBaseUrl appears to point to the web app. Use the direct API base URL ending in /v1.',
    );
  }
  if (!lower.endsWith('/v1') && !lower.endsWith('/v1/')) {
    errors.push('ERROR: centralApiBaseUrl must end with /v1 (direct NestJS API prefix).');
  }

  try {
    const u = new URL(raw.replace(/\/$/, ''));
    const host = u.hostname.toLowerCase();
    const isDedicatedApiHost =
      host.startsWith('api.') || host.includes('localhost') || host.includes('127.0.0.1');
    const isTenantSlugHost = host.endsWith('.tofan.dev') && !host.startsWith('api.');
    if (!isDedicatedApiHost) {
      if (isTenantSlugHost) {
        warnings.push(
          `WARNING: centralApiBaseUrl host "${host}" is a tenant web host. Use https://api.tofan.dev/v1 for Attendance Bridge (direct NestJS), not ${host}/v1.`,
        );
      } else {
        warnings.push(
          `WARNING: centralApiBaseUrl host "${host}" does not look like a dedicated API host. Prefer https://api.<domain>/v1.`,
        );
      }
    }
  } catch {
    // URL format errors handled elsewhere
  }

  const activateUrl = buildActivateUrl(raw);
  if (!activateUrl.endsWith(BRIDGE_ACTIVATE_SUFFIX)) {
    errors.push(`ERROR: resolved activate URL must end with ${BRIDGE_ACTIVATE_SUFFIX}`);
  }

  return { errors, warnings };
}

export function isCsrfBlockedResponse(status: number, message: string): boolean {
  return status === 403 && /csrf/i.test(message);
}

export function formatCsrfMisconfigError(apiBaseUrl: string): string {
  const safe = redactApiBaseUrl(apiBaseUrl);
  return [
    'ERROR: The bridge reached a browser-protected endpoint.',
    'Use the direct Afaq API base URL in config.json, not the tenant web URL.',
    `Current centralApiBaseUrl: ${safe}`,
    'Expected endpoint path: /v1/hrm/attendance/bridges/activate',
  ].join('\n');
}
