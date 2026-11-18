const cacheKey = 'jeltops-public-history';
const pageSize = 7;
let recentSamples;

function cachedSamples() {
  if (recentSamples) return recentSamples;
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(cacheKey));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function rememberPublicHistory(logs) {
  if (!logs.length) return;
  recentSamples = logs.map(({ id, target, status, statusCode, latencyMs, dnsLookupMs, tcpConnectMs, requestIp, serverRegion, timestamp }) => ({
    id, target, status, statusCode, latencyMs, dnsLookupMs, tcpConnectMs, requestIp, serverRegion,
    timestamp: timestamp.toISOString()
  }));
  try {
    globalThis.localStorage.setItem(cacheKey, JSON.stringify(recentSamples));
  } catch {
    // Browsers with storage disabled can still use the in-memory copy.
  }
}

function readRecentHistory(params) {
  const from = Date.parse(params.get('from'));
  const to = Date.parse(params.get('to'));
  const target = params.get('target');
  const event = params.get('event');
  const cursor = params.get('cursor');
  const recent = cachedSamples();
  const previousStatus = new Map();
  const matching = [];

  for (const sample of [...recent].reverse()) {
    const recovered = sample.status === 'UP' && previousStatus.get(sample.target) === 'DOWN';
    previousStatus.set(sample.target, sample.status);
    const timestamp = Date.parse(sample.timestamp);
    const state = sample.status === 'UP' ? 'up' : sample.status === 'DOWN' ? 'down' : 'unknown';
    if (timestamp >= from && timestamp < to && (target === 'all' || target === sample.target) &&
        (event === 'all' || (event === 'recovered' ? recovered : event === state))) {
      matching.unshift({ ...sample, recovered: event === 'recovered' });
    }
  }

  const offset = cursor ? matching.findIndex(sample => 'recent:' + sample.id === cursor) + 1 : 0;
  if ((cursor && offset === 0) || !matching.length) return null;
  const samples = matching.slice(offset, offset + pageSize);
  return {
    samples,
    nextCursor: offset + samples.length < matching.length ? 'recent:' + samples.at(-1).id : null,
    partial: true
  };
}

export async function requestPublicHistory(params, signal) {
  if (params.get('cursor')?.startsWith('recent:')) {
    const recent = readRecentHistory(params);
    if (recent) return recent;
    throw new Error('Os registros locais mudaram. Tente novamente para voltar à primeira página.');
  }

  let errorMessage = 'Não foi possível consultar o histórico.';
  try {
    const response = await fetch('/api/check-history?' + params, { signal, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (response.ok && body) return body;
    if (!response.ok && response.status < 500) return Promise.reject(new Error(body?.error || errorMessage));
    errorMessage = body?.error || errorMessage;
  } catch (error) {
    if (signal.aborted) throw error;
  }
  if (!params.has('cursor')) {
    const recent = readRecentHistory(params);
    if (recent) return recent;
  }
  throw new Error(errorMessage);
}
