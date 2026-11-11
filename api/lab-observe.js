import { getLabWithRecovery, getLabReport, recordLabObservation, validateObservationToken } from '../backend/lab-store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.LAB_TEST_ENABLED !== 'true') return res.status(404).json({error:'lab_disabled'});
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'method_not_allowed'});
  try {
    const state = await getLabWithRecovery();
    if (!state.runId) return res.status(200).json({runId:null,simulatedEvents:[],observedChecks:[]});
    if (req.method === 'GET') return res.status(200).json(await getLabReport(state.runId));
    const runId = req.body?.runId;
    const token = req.headers['x-lab-observation-token'];
    if (runId !== state.runId || !(await validateObservationToken(runId,token))) {
      return res.status(403).json({error:'observation_not_authorized'});
    }
    // Only the known deployment's lab endpoint may be requested. Never accept a client URL.
    const deployment = process.env.VERCEL_URL;
    if (!deployment || !/^[a-z0-9-]+\.vercel\.app$/.test(deployment)) {
      return res.status(503).json({error:'lab_deployment_not_configured'});
    }
    const started = Date.now();
    let statusCode = 0, error = null, responseJson = null;
    try {
      const response = await fetch('https://' + deployment + '/api/lab-target', {
        cache:'no-store', redirect:'manual', signal:AbortSignal.timeout(5000)
      });
      statusCode = response.status;
      // Only capture bounded JSON from the fixed internal lab target, never arbitrary URLs.
      const raw = await response.text();
      if (raw.length <= 8192) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.service === 'jeltops-lab') responseJson = parsed;
        } catch { /* non-JSON response is not controlled lab evidence */ }
      }
    } catch (e) {
      error = e?.name === 'TimeoutError' ? 'timeout' : 'connection_failed';
    }
    const observedAtMs = Date.now();
    const confirmed = responseJson?.service === 'jeltops-lab' && [200,503].includes(statusCode);
    if (statusCode && !confirmed) error = 'unexpected_http_response';
    const status = !confirmed ? 'UNKNOWN' : statusCode === 200 ? 'UP' : 'DOWN';
    const phaseKey = !confirmed ? 'other' : statusCode === 503 ? 'outage' : observedAtMs >= new Date(state.endsAt).getTime() ? 'recovery' : 'other';
    const sample = {statusCode,status,latencyMs:observedAtMs-started,observedAtMs,error,responseJson,phase:phaseKey,phaseKey};
    await recordLabObservation(runId,sample);
    return res.status(200).json({observation:sample});
  } catch(e) {
    console.error('[Laboratório observação]',e.message);
    return res.status(503).json({error:'observation_unavailable'});
  }
}
