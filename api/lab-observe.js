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
    let statusCode = 0, error = null;
    try {
      const response = await fetch('https://' + deployment + '/api/lab-target', {
        cache:'no-store', redirect:'manual', signal:AbortSignal.timeout(5000)
      });
      statusCode = response.status;
      await response.body?.cancel();
    } catch (e) {
      error = e?.name === 'TimeoutError' ? 'timeout' : 'connection_failed';
    }
    const observedAtMs = Date.now();
    const status = statusCode === 0 ? 'UNKNOWN' : statusCode >= 200 && statusCode < 400 ? 'UP' : 'DOWN';
    const phaseKey = statusCode === 503 ? 'outage' : statusCode === 200 && observedAtMs >= new Date(state.endsAt).getTime() ? 'recovery' : 'other';
    const sample = {statusCode,status,latencyMs:observedAtMs-started,observedAtMs,error,phase:phaseKey,phaseKey};
    await recordLabObservation(runId,sample);
    return res.status(200).json({observation:sample});
  } catch(e) {
    console.error('[Laboratório observação]',e.message);
    return res.status(503).json({error:'observation_unavailable'});
  }
}
