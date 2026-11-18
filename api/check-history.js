import { readCheckHistory, referenceTargets } from '../backend/check-history.js';
import { getLabDb } from '../backend/lab-store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const result = await readCheckHistory(getLabDb().collection('metrics_logs'), req.query, {
      targets: referenceTargets,
      classify: data => data.status === 'UP' ? 'up' : data.status === 'DOWN' ? 'down' : 'unknown',
      serialize: doc => {
        const { target, status, statusCode, latencyMs, dnsLookupMs, tcpConnectMs, requestIp, serverRegion, timestamp } = doc.data();
        return { id: doc.id, target, status, statusCode, latencyMs, dnsLookupMs, tcpConnectMs, requestIp, serverRegion, timestamp: timestamp.toDate().toISOString() };
      }
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error.message === 'historico_invalido') return res.status(400).json({ error: 'Confira os filtros e tente novamente.' });
    console.error('[Histórico público]', error.message);
    return res.status(503).json({ error: 'Histórico temporariamente indisponível.' });
  }
}
