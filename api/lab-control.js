import { createHash, timingSafeEqual } from 'node:crypto';
import { startLab, getLabWithRecovery } from '../backend/lab-store.js';

function authorized(req) {
  const expected = process.env.LAB_CONTROL_TOKEN;
  const candidate = req.headers['x-lab-control-token'];
  if (!expected || typeof candidate !== 'string' || candidate.length > 256) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(candidate).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.LAB_TEST_ENABLED !== 'true') return res.status(404).json({error:'lab_disabled'});
  try {
    if (req.method === 'GET') {
      const state = await getLabWithRecovery();
      return res.status(200).json({service:'jeltops-lab', ...state, observedAt:new Date().toISOString()});
    }
    if (req.method === 'POST') {
      if (!authorized(req)) return res.status(401).json({error:'unauthorized'});
      if (req.body?.action !== 'start') return res.status(400).json({error:'invalid_action'});
      const state = await startLab();
      return res.status(200).json({service:'jeltops-lab', ...state});
    }
    return res.status(405).json({error:'method_not_allowed'});
  } catch (err) {
    if (err.message === 'lab_already_running') return res.status(409).json({error:'lab_already_running'});
    console.error('[Lab] Falha no experimento:', err.message);
    return res.status(503).json({error:'lab_unavailable'});
  }
}
