import { Client } from '@elastic/elasticsearch';

const elasticClient = new Client({
  node: process.env.ELASTIC_NODE || 'http://localhost:9200',
  auth: {
    username: process.env.ELASTIC_USERNAME || 'elastic',
    password: process.env.ELASTIC_PASSWORD || 'changeme'
  }
});

const INDEX_NAME = 'jeltops-metrics';
const LOGS_INDEX = 'jeltops-logs';

export async function testConnection() {
  try {
    await elasticClient.cluster.health();
    console.log('[Elastic] ✅ Conectado ao Elasticsearch');
    return true;
  } catch (error) {
    console.error('[Elastic] ❌ Erro ao conectar:', error.message);
    return false;
  }
}

export async function initializeIndices() {
  try {
    const metricsExists = await elasticClient.indices.exists({ index: INDEX_NAME });
    if (!metricsExists) {
      await elasticClient.indices.create({
        index: INDEX_NAME,
        settings: { number_of_shards: 1, number_of_replicas: 0 }
      });
    }
  } catch (error) {
    console.error('[Elastic] Erro ao inicializar índices:', error.message);
  }
}

export async function indexMetric(metric) {
  try {
    await elasticClient.index({
      index: INDEX_NAME,
      document: { timestamp: new Date(), ...metric }
    });
  } catch (error) {
    console.error('[Elastic] Erro ao indexar métrica:', error.message);
  }
}

export async function indexLog(level, message, targetName) {
  try {
    await elasticClient.index({
      index: LOGS_INDEX,
      document: { timestamp: new Date(), level, message, target_name: targetName }
    });
  } catch (error) {
    console.error('[Elastic] Erro ao indexar log:', error.message);
  }
}

// Funções exigidas pelo server.js com fallback integrado
export async function getMetricsSummary() {
  try {
    const result = await elasticClient.search({
      index: INDEX_NAME,
      query: { range: { timestamp: { gte: 'now-24h' } } },
      aggs: {
        by_target: {
          terms: { field: 'target_name', size: 100 },
          aggs: { avg_latency: { avg: { field: 'latency_ms' } } }
        }
      }
    });
    return result.aggregations.by_target.buckets;
  } catch (error) {
    // Retorna array vazio ou mock para evitar crash quando o Elastic estiver offline
    return [];
  }
}

export async function getTargetStats(targetName) {
  try {
    return await elasticClient.search({
      index: INDEX_NAME,
      query: { term: { target_name: targetName } }
    });
  } catch (error) {
    return null;
  }
}

export { elasticClient };