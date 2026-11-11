// Persistence policy for HTTP checks. All probes execute; only important samples are saved.
export const STABLE_SAMPLE_INTERVAL_MS = 10 * 60 * 1000;

export function shouldSaveCheck(previous, current, nowMs = Date.now()) {
  if (!previous || !previous.timestamp) return true;
  if (previous.status !== current.status) return true;
  // Include HTTP code changes even when both codes fall in the same UP/DOWN class.
  if (Number(previous.statusCode ?? 0) !== Number(current.statusCode ?? 0)) return true;
  const previousMs = previous.timestamp?.toMillis?.() ?? new Date(previous.timestamp).getTime();
  if (!Number.isFinite(previousMs)) return true;
  return nowMs - previousMs >= STABLE_SAMPLE_INTERVAL_MS;
}
