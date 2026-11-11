// Isolated HTTP failure/recovery simulation for a Vercel preview deployment.
const MINUTE_MS = 60_000;

export function getLabState(nowMs, startMs) {
  if (!Number.isFinite(startMs)) return { phase: 'NOT_CONFIGURED', statusCode: 503 };
  const elapsed = nowMs - startMs;
  if (elapsed < 0) return { phase: 'WAITING', statusCode: 200 };
  if (elapsed < 2 * MINUTE_MS) return { phase: 'HEALTHY', statusCode: 200 };
  if (elapsed < 14 * MINUTE_MS) return { phase: 'SIMULATED_OUTAGE', statusCode: 503 };
  return { phase: 'RECOVERED', statusCode: 200 };
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'method_not_allowed' });
  if (process.env.LAB_ENABLED !== 'true') return res.status(404).json({ error: 'lab_disabled' });
  const startMs = Date.parse(process.env.LAB_START_AT || '');
  if (!Number.isFinite(startMs)) return res.status(503).json({ error: 'LAB_START_AT_missing_or_invalid' });
  const now = Date.now();
  const state = getLabState(now, startMs);
  return res.status(state.statusCode).json({
    service: 'jeltops-lab', scenario: 'automatic-recovery',
    phase: state.phase, status: state.statusCode === 200 ? 'UP' : 'DOWN',
    checkedAt: new Date(now).toISOString(),
    startAt: new Date(startMs).toISOString(),
    outageFrom: new Date(startMs + 2 * MINUTE_MS).toISOString(),
    recoveryAt: new Date(startMs + 14 * MINUTE_MS).toISOString(),
    note: 'Controlled HTTP simulation; underlying server remains running.'
  });
}
