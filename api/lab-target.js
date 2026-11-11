import { getLabWithRecovery } from '../backend/lab-store.js';
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

// Deterministic repeating demo: 10 min healthy, 10 min 503, 10 min recovered.
export function getCyclicLabState(nowMs) {
  const slot = Math.floor(((nowMs % (30 * MINUTE_MS)) + 30 * MINUTE_MS) % (30 * MINUTE_MS) / (10 * MINUTE_MS));
  return slot === 0 ? { phase: 'HEALTHY', statusCode: 200 } : slot === 1 ? { phase: 'SIMULATED_OUTAGE', statusCode: 503 } : { phase: 'RECOVERED', statusCode: 200 };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({error:'method_not_allowed'});
  if (process.env.LAB_TEST_ENABLED !== 'true') return res.status(404).json({error:'lab_disabled'});
  try {
    const state = await getLabWithRecovery();
    return res.status(state.statusCode).json({
      service:'jeltops-lab', scenario:'manual-30s-recovery',
      status:state.status, phase:state.phase, checkedAt:new Date().toISOString(),
      recoveryAt:state.endsAt,
      note:'HTTP 503 simulado no serviço controlado, recuperação automática em 30 segundos.'
    });
  } catch (err) {
    console.error('[Lab] indisponível:', err.message);
    return res.status(503).json({error:'lab_backend_unavailable'});
  }
}
