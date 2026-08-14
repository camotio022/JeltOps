// sentry-exporter.js - Integração com Sentry.io

import * as Sentry from '@sentry/node';

/**
 * Inicializa Sentry com DSN
 * @param {string} dsn - Sentry DSN
 */
export function initSentry(dsn) {
  if (!dsn) {
    console.warn('[Sentry] ⚠️  DSN não configurado. Sentry desabilitado.');
    console.warn('[Sentry] Configure a variável SENTRY_DSN para ativar');
    return false;
  }

  try {
    Sentry.init({
      dsn,
      tracesSampleRate: 1.0,
      environment: process.env.NODE_ENV || 'development',
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.OnUncaughtException(),
        new Sentry.Integrations.OnUnhandledRejection()
      ]
    });
    
    console.log('[Sentry] ✅ Inicializado com DSN:', dsn.substring(0, 30) + '...');
    return true;
  } catch (error) {
    console.error('[Sentry] ❌ Erro ao inicializar:', error.message);
    return false;
  }
}

/**
 * Captura uma exceção
 * @param {Error} error - Erro a capturar
 * @param {Object} context - Contexto adicional
 */
export function captureException(error, context = {}) {
  try {
    Sentry.captureException(error, {
      contexts: {
        custom: context
      }
    });
  } catch (err) {
    console.error('[Sentry] Erro ao capturar exception:', err.message);
  }
}

/**
 * Registra um evento de mensagem
 * @param {string} message - Mensagem
 * @param {string} level - 'info', 'warning', 'error'
 * @param {Object} extra - Dados adicionais
 */
export function captureMessage(message, level = 'info', extra = {}) {
  try {
    Sentry.captureMessage(message, level);
    if (Object.keys(extra).length > 0) {
      Sentry.setContext('extra', extra);
    }
  } catch (err) {
    console.error('[Sentry] Erro ao capturar message:', err.message);
  }
}

/**
 * Registra uma transação (rastreamento de performance)
 * Retorna uma transação para ser finalizada
 * @param {string} name - Nome da transação
 * @param {string} op - Operação (e.g., 'http.client')
 */
export function startTransaction(name, op = 'http.client') {
  try {
    return Sentry.startTransaction({
      name,
      op,
      sampled: true
    });
  } catch (error) {
    console.error('[Sentry] Erro ao iniciar transação:', error.message);
    return null;
  }
}

/**
 * Finaliza uma transação
 * @param {Object} transaction - Transação retornada por startTransaction
 * @param {string} status - 'ok', 'cancelled', 'unknown', 'unauthenticated', 'permission_denied', 'not_found', 'resource_exhausted', 'failed_precondition', 'aborted', 'out_of_range', 'unavailable', 'internal_error', 'data_loss', 'deadline_exceeded'
 */
export function finishTransaction(transaction, status = 'ok') {
  try {
    if (transaction) {
      transaction.setStatus(status);
      transaction.finish();
    }
  } catch (error) {
    console.error('[Sentry] Erro ao finalizar transação:', error.message);
  }
}

/**
 * Registra dados de uptime/status de um alvo
 * @param {Object} metric - { target_name, url, status, latency_ms, status_code }
 */
export function recordHealthCheck(metric) {
  try {
    Sentry.captureMessage(
      `Health check: ${metric.target_name} is ${metric.status}`,
      metric.status === 'UP' ? 'info' : 'warning',
      {
        tags: {
          target_name: metric.target_name,
          status: metric.status,
          status_code: metric.status_code
        },
        extra: {
          url: metric.url,
          latency_ms: metric.latency_ms
        }
      }
    );
  } catch (error) {
    console.error('[Sentry] Erro ao registrar health check:', error.message);
  }
}

/**
 * Define contexto de usuário/sessão
 * @param {Object} user - { id, email, username }
 */
export function setUserContext(user) {
  try {
    Sentry.setUser(user);
  } catch (error) {
    console.error('[Sentry] Erro ao setar user context:', error.message);
  }
}

/**
 * Adiciona breadcrumb (rastro de eventos)
 * @param {string} message - Mensagem
 * @param {string} category - Categoria
 * @param {string} level - 'fatal', 'error', 'warning', 'info', 'debug'
 * @param {Object} data - Dados adicionais
 */
export function addBreadcrumb(message, category = 'default', level = 'info', data = {}) {
  try {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data
    });
  } catch (error) {
    console.error('[Sentry] Erro ao adicionar breadcrumb:', error.message);
  }
}

/**
 * Retorna cliente Sentry para uso avançado
 */
export { Sentry };

/**
 * Middleware Express para capturar erros e rastrear requisições
 */
export function sentryMiddleware(app) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.errorHandler());
}
