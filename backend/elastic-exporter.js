// elastic-exporter.js - Integração com Elasticsearch

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

/**
 * Verifica conexão com Elasticsearch
 */
export async function testConnection() {
  try {
    const health = await elasticClient.cluster.health();
    console.log('[Elastic] ✅ Conectado ao Elasticsearch');
    return true;
  } catch (error) {
    console.error('[Elastic] ❌ Erro ao conectar:', error.message);
    return false;
  }
}

/**
 * Cria índices se não existirem
 */
export async function initializeIndices() {
  try {
    // Verificar se índice de métricas existe
    const metricsExists = await elasticClient.indices.exists({ index: INDEX_NAME });
    if (!metricsExists) {
      await elasticClient.indices.create({
        index: INDEX_NAME,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0
        },
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            target_name: { type: 'keyword' },
            url: { type: 'keyword' },
            status: { type: 'keyword' },
            latency_ms: { type: 'integer' },
            status_code: { type: 'integer' }
          }
        }
      });
      console.log(`[Elastic] 📋 Índice ${INDEX_NAME} criado`);
    }

    // Verificar se índice de logs existe
    const logsExists = await elasticClient.indices.exists({ index: LOGS_INDEX });
    if (!logsExists) {
      await elasticClient.indices.create({
        index: LOGS_INDEX,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0
        },
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            level: { type: 'keyword' },
            message: { type: 'text' },
            target_name: { type: 'keyword' }
          }
        }
      });
      console.log(`[Elastic] 📋 Índice ${LOGS_INDEX} criado`);
    }
  } catch (error) {
    console.error('[Elastic] Erro ao inicializar índices:', error.message);
  }
}

/**
 * Registra uma métrica no Elasticsearch
 * @param {Object} metric - Dados da métrica
 */
export async function indexMetric(metric) {
  try {
    await elasticClient.index({
      index: INDEX_NAME,
      document: {
        timestamp: new Date(),
        target_name: metric.target_name,
        url: metric.url,
        status: metric.status,
        latency_ms: metric.latency_ms,
        status_code: metric.status_code
      }
    });
  } catch (error) {
    console.error('[Elastic] Erro ao indexar métrica:', error.message);
  }
}

/**
 * Registra um log
 * @param {string} level - 'info', 'warn', 'error'
 * @param {string} message - Mensagem
 * @param {string} targetName - Nome do alvo
 */
export async function indexLog(level, message, targetName) {
  try {
    await elasticClient.index({
      index: LOGS_INDEX,
      document: {
        timestamp: new Date(),
        level,
        message,
        target_name: targetName
      }
    });
  } catch (error) {
    console.error('[Elastic] Erro ao indexar log:', error.message);
  }
}

/**
 * Busca métricas agregadas (últimas 24h)
 */
export async function getMetricsSummary() {
  try {
    const result = await elasticClient.search({
      index: INDEX_NAME,
      query: {
        range: {
          timestamp: {
            gte: 'now-24h'
          }
        }
      },
      aggs: {
        by_target: {
          terms: {
            field: 'target_name',
            size: 100
          },
          aggs: {
            avg_latency: {
              avg: { field: 'latency_ms' }
            },
            status_distribution: {
              terms: { field: 'status' }
            }
          }
        }
      }
    });

    return result.aggregations.by_target.buckets;
  } catch (error) {
    console.error('[Elastic] Erro ao buscar summary:', error.message);
    return [];
  }
}

/**
 * Obtém estatísticas detalhadas por alvo
 */
export async function getTargetStats(targetName) {
  try {
    const result = await elasticClient.search({
      index: INDEX_NAME,
      query: {
        bool: {
          must: [
            { term: { target_name: targetName } },
            { range: { timestamp: { gte: 'now-24h' } } }
          ]
        }
      },
      aggs: {
        uptime_percentage: {
          filter: { term: { status: 'UP' } }
        },
        p95_latency: {
          percentiles: {
            field: 'latency_ms',
            percents: [95]
          }
        },
        p99_latency: {
          percentiles: {
            field: 'latency_ms',
            percents: [99]
          }
        },
        avg_latency: {
          avg: { field: 'latency_ms' }
        },
        status_codes: {
          terms: { field: 'status_code', size: 20 }
        }
      }
    });

    return result;
  } catch (error) {
    console.error('[Elastic] Erro ao buscar stats:', error.message);
    return null;
  }
}

export { elasticClient };
