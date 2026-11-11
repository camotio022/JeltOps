import { startLab, getLabWithRecovery } from '../backend/lab-store.js';
import { requirePresenter, issuePresenterCode, consumePresenterCode } from '../backend/lab-presenter.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (process.env.LAB_TEST_ENABLED !== 'true') return res.status(404).json({error:'lab_disabled'});
  try {
    if (req.method === 'GET') {
      const state = await getLabWithRecovery();
      return res.status(200).json({service:'jeltops-lab', ...state, observedAt:new Date().toISOString()});
    }
    if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
    let user;
    try { user = await requirePresenter(req); }
    catch (e) {
      return res.status(e.message === 'presenter_forbidden' ? 403 : 401)
        .json({error:e.message === 'presenter_forbidden' ? 'Conta sem permissão de apresentador.' : 'Entre com Google para continuar.'});
    }
    if (req.body?.action === 'issue_code') {
      const challenge = await issuePresenterCode(user.uid);
      return res.status(200).json({service:'jeltops-lab', ...challenge});
    }
    if (req.body?.action === 'start') {
      const state = await startLab({ uid:user.uid, code:req.body.code, verifyCode:consumePresenterCode });
      return res.status(200).json({service:'jeltops-lab', ...state});
    }
    return res.status(400).json({error:'invalid_action'});
  } catch (err) {
    if (err.message === 'lab_already_running') return res.status(409).json({error:'lab_already_running'});
    if (err.message === 'code_invalid' || err.message === 'code_expired') return res.status(403).json({error:'Código inválido, expirado ou já utilizado.'});
    if (err.message === 'code_cooldown') return res.status(429).json({error:'Aguarde 30 segundos para gerar outro código.'});
    console.error('[Lab] Falha no experimento:', err.message);
    return res.status(503).json({error:'lab_unavailable'});
  }
}
