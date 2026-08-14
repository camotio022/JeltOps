// prometheus-exporter.js - Exportador de métricas para Prometheus

import client from 'prom-client';

// Criar registro de métricas
const register = new client.Registry();

// Adicionar métricas padrão do Node.js
client.collectDefaultMetrics({ register });

// Métrica 1: Status dos alvos (1 = UP, 0 = DOWN)
const targetStatus = new client.Gauge({
  name: 'jeltops_target_status',
  help: 'Status do alvo monitorado (1 = UP, 0 = DOWN)',
  labelNames: ['target_name', 'url'],
  registers: [register]
});

// Métrica 2: Latência em ms
const targetLatency = new client.Histogram({
  name: 'jeltops_target_latency_ms',
  help: 'Latência da requisição em milissegundos',
  labelNames: ['target_name', 'url'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
  registers: [register]
});

// Métrica 3: Status code HTTP
const httpStatusCode = new client.Counter({
  name: 'jeltops_http_status_code',
  help: 'Contagem de status codes HTTP recebidos',
  labelNames: ['target_name', 'status_code'],
  registers: [register]
});

// Métrica 4: Total de checks realizados
const checksTotal = new client.Counter({
  name: 'jeltops_checks_total',
  help: 'Total de checks realizados',
  labelNames: ['target_name', 'status'],
  registers: [register]
});

// Métrica 5: Mudanças de status
const statusChanges = new client.Counter({
  name: 'jeltops_status_changes_total',
  help: 'Total de mudanças de status de um alvo',
  labelNames: ['target_name', 'from_status', 'to_status'],
  registers: [register]
});

// Métrica 6: Erros de requisição
const requestErrors = new client.Counter({
  name: 'jeltops_request_errors_total',
  help: 'Total de erros ao fazer requisições',
  labelNames: ['target_name', 'error_type'],
  registers: [register]
});

/**
 * Registra uma verificação no Prometheus
 * @param {Object} target - Objeto com name, url
 * @param {string} status - 'UP' ou 'DOWN'
 * @param {number} latency - Latência em ms
 * @param {number} statusCode - Status code HTTP
 * @param {string} previousStatus - Status anterior para detecção de mudança
 * @param {Error} error - Erro se houver
 */
export function recordMetric(target, status, latency, statusCode, previousStatus, error) {
  const targetLabel = { target_name: target.name, url: target.url };
  
  // Registrar status (1 ou 0)
  const statusValue = status === 'UP' ? 1 : 0;
  targetStatus.set(targetLabel, statusValue);
  
  // Registrar latência (apenas se sucesso)
  if (latency && statusCode < 500) {
    targetLatency.observe(targetLabel, latency);
  }
  
  // Registrar status code
  httpStatusCode.inc({
    target_name: target.name,
    status_code: statusCode
  });
  
  // Registrar check realizado
  checksTotal.inc({
    target_name: target.name,
    status: status
  });
  
  // Detectar mudança de status
  if (previousStatus && previousStatus !== status) {
    statusChanges.inc({
      target_name: target.name,
      from_status: previousStatus,
      to_status: status
    });
  }
  
  // Registrar erro se houver
  if (error) {
    const errorType = error.name || 'Unknown';
    requestErrors.inc({
      target_name: target.name,
      error_type: errorType
    });
  }
}

/**
 * Retorna as métricas formatadas para Prometheus
 */
export async function getMetricsAsPrometheus() {
  return await register.metrics();
}

export { register };
