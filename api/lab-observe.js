import { claimLabRecoveryProbe, getLabWithRecovery, getLabReport, recordLabObservation, validateObservationToken } from '../backend/lab-store.js';
import { classifyLabObservation, probeLabTarget } from '../backend/lab-http-probe.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.LAB_TEST_ENABLED !== 'true') return res.status(404).json({error:'lab_disabled'});
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'method_not_allowed'});
  try {
    const state = await getLabWithRecovery();
    const withTiming = (report) => ({
      ...report,
      endsAtMs: state.endsAt ? Date.parse(state.endsAt) : null,
      serverNowMs: Date.now(),
      recoveryRetriesExhausted: state.recoveryRetriesExhausted
    });
    if (req.method === 'GET') {
      let report = state.runId ? await getLabReport(state.runId) :
        {runId:null,simulatedEvents:[],observedChecks:[]};
      if (state.recovered &&
          report.observedChecks.some(check => check.phase === 'outage' && !check.error) &&
          !report.observedChecks.some(check => check.phase === 'recovery' && !check.error) &&
          await claimLabRecoveryProbe(state.runId)) {
        const sample = classifyLabObservation(await probeLabTarget(), 'recovery', state.runId);
        await recordLabObservation(state.runId, sample);
        report = await getLabReport(state.runId);
      }
      return res.status(200).json(withTiming(report));
    }
    const {runId, phase} = req.body ?? {};
    const token = req.headers['x-lab-observation-token'];
    if (runId !== state.runId || !(await validateObservationToken(runId,token))) {
      return res.status(403).json({error:'observation_not_authorized'});
    }
    const activePhase = state.status === 'DOWN' ? 'outage' : 'recovery';
    if (phase !== undefined && phase !== activePhase) {
      return res.status(409).json({error:'A janela desta medição já mudou.'});
    }
    const sample = classifyLabObservation(await probeLabTarget(), activePhase, runId);
    await recordLabObservation(runId,sample);
    return res.status(200).json(withTiming({observation:sample, ...await getLabReport(runId)}));
  } catch(e) {
    console.error('[Laboratório observação]',e.message);
    return res.status(503).json({error:'observation_unavailable'});
  }
}
