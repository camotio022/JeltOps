export const LAB_DURATION_MS = 30_000;

export function resolveLabState(state, now = Date.now()) {
  if (!state?.startedAtMs || !state?.endsAtMs) {
    return { phase: 'HEALTHY', statusCode: 200, status: 'UP', recovered: false };
  }
  const expired = now >= state.endsAtMs;
  return expired
    ? { phase: 'RECOVERED', statusCode: 200, status: 'UP', recovered: true }
    : { phase: 'SIMULATED_OUTAGE', statusCode: 503, status: 'DOWN', recovered: false };
}
