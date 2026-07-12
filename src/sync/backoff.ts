export type BackoffState = { attempt: number; nextDelayMs: number };

const BASE_MS = 2000;
const MAX_MS = 120_000;

export function nextBackoff(state: BackoffState, success: boolean): BackoffState {
  if (success) return { attempt: 0, nextDelayMs: BASE_MS };
  const attempt = state.attempt + 1;
  const nextDelayMs = Math.min(BASE_MS * 2 ** attempt, MAX_MS);
  return { attempt, nextDelayMs };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
