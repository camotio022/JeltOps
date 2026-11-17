export async function probeLabTarget({ env = process.env, request = fetch } = {}) {
  const started = Date.now();
  const production = env.VERCEL_ENV === 'production';
  const host = production
    ? env.VERCEL_PROJECT_PRODUCTION_URL || 'jeltops.vercel.app'
    : env.VERCEL_URL;
  let statusCode = 0;
  let responseJson = null;
  let error = null;

  if (!host || !/^[a-z0-9-]+\.vercel\.app$/.test(host)) {
    error = 'lab_deployment_not_configured';
  } else {
    try {
      const headers = {};
      if (!production && env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        headers['x-vercel-protection-bypass'] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
      }
      const response = await request('https://' + host + '/api/lab-target', {
        headers, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(5000)
      });
      statusCode = response.status;
      if ([200, 503].includes(statusCode)) {
        const raw = await response.text();
        if (raw.length <= 8192) {
          const body = JSON.parse(raw);
          if (body?.service === 'jeltops-lab') responseJson = body;
        }
      }
      if (!responseJson) error = 'unexpected_http_response';
    } catch (e) {
      error = e.name === 'TimeoutError' ? 'timeout' :
        e.name === 'SyntaxError' ? 'unexpected_http_response' : 'connection_failed';
    }
  }

  const observedAtMs = Date.now();
  return { statusCode, latencyMs: observedAtMs - started, observedAtMs, error, responseJson };
}

export function classifyLabObservation(sample, phase, runId) {
  const body = sample.responseJson;
  const baseline = sample.statusCode === 200 && ['HEALTHY', 'RECOVERED'].includes(body?.phase);
  const outage = sample.statusCode === 503 && body?.phase === 'SIMULATED_OUTAGE';
  const recovery = sample.statusCode === 200 && body?.phase === 'RECOVERED';
  const matchesPhase = phase === 'baseline' ? baseline :
    body?.runId === runId && (phase === 'outage' ? outage : recovery);
  const error = sample.error || (matchesPhase ? null : 'unexpected_lab_state');
  return {
    ...sample, error, phase,
    phaseKey: error ? phase + '-error' : phase,
    status: error ? 'UNKNOWN' : phase === 'outage' ? 'DOWN' : 'UP'
  };
}
