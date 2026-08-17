import { Client } from '@elastic/elasticsearch';

// Flag para saber se tentamos conectar
const isConfigured = !!process.env.ELASTIC_NODE;

let elasticClient = null;

if (isConfigured) {
  elasticClient = new Client({
    node: process.env.ELASTIC_NODE,
    auth: {
      username: process.env.ELASTIC_USERNAME || 'elastic',
      password: process.env.ELASTIC_PASSWORD || 'changeme'
    }
  });
}

// Atualizamos a função de indexação para checar se o cliente existe
export async function indexMetric(metric) {
  if (!elasticClient) return; // Silencioso se não configurado
  try {
    await elasticClient.index({
      index: 'jeltops-metrics',
      document: { timestamp: new Date(), ...metric }
    });
  } catch (error) {
    console.error('[Elastic] Erro ao indexar métrica:', error.message);
  }
}

// E na função de teste de conexão
export async function testConnection() {
  if (!elasticClient) return false;
  try {
    await elasticClient.cluster.health();
    console.log('[Elastic] ✅ Conectado ao Elasticsearch');
    return true;
  } catch (error) {
    console.error('[Elastic] ❌ Erro ao conectar:', error.message);
    return false;
  }
}