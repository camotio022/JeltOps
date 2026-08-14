// server.js - Servidor que expõe métricas e dados para o React

import express from 'express';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { getMetricsAsPrometheus } from './prometheus-exporter.js';
import { getMetricsSummary, getTargetStats } from './elastic-exporter.js';
import { initSentry, recordHealthCheck as sentryRecordHealthCheck } from './sentry-exporter.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

// Inicializar Firebase
initializeApp({
  credential: cert(serviceAccount)
});

const firestore = getFirestore();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// CORS para React
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Inicializar Sentry se DSN estiver configurado
if (process.env.SENTRY_DSN) {
  initSentry(process.env.SENTRY_DSN);
}

/**
 * Endpoint Prometheus - Expõe métricas em formato Prometheus
 * Usado por: Prometheus scraper
 */
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await getMetricsAsPrometheus();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (error) {
    console.error('[Server] Erro ao coletar métricas:', error);
    res.status(500).send('Erro ao coletar métricas');
  }
});

/**
 * API: Status geral do sistema
 * GET /api/status
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    apms: {
      prometheus: {
        enabled: true,
        endpoint: 'http://localhost:3001/metrics',
        grafana: 'http://localhost:3000'
      },
      elastic: {
        enabled: !!process.env.ELASTIC_NODE,
        endpoint: process.env.ELASTIC_NODE || 'not-configured'
      },
      sentry: {
        enabled: !!process.env.SENTRY_DSN,
        endpoint: 'https://sentry.io/'
      }
    },
    firestore: {
      enabled: true,
      collection: 'metrics_logs'
    }
  });
});

/**
 * API: Dados consolidados do Firestore (últimas 50 métricas)
 * GET /api/data/firestore
 */
app.get('/api/data/firestore', async (req, res) => {
  try {
    const snapshot = await firestore.collection('metrics_logs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || new Date()
    }));

    res.json({
      source: 'firestore',
      count: data.length,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Erro ao buscar dados Firestore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Dados consolidados de todos os APMs + Firestore
 * GET /api/data/all
 */
app.get('/api/data/all', async (req, res) => {
  try {
    const result = {
      timestamp: new Date().toISOString(),
      sources: {}
    };

    // Firestore
    try {
      const snapshot = await firestore.collection('metrics_logs')
        .orderBy('timestamp', 'desc')
        .limit(30)
        .get();
      result.sources.firestore = {
        enabled: true,
        count: snapshot.size,
        data: snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate?.() || new Date()
        }))
      };
    } catch (error) {
      result.sources.firestore = { enabled: false, error: error.message };
    }

    // Prometheus
    try {
      const metrics = await getMetricsAsPrometheus();
      result.sources.prometheus = {
        enabled: true,
        metricsRaw: metrics.substring(0, 500) // Primeiras 500 chars
      };
    } catch (error) {
      result.sources.prometheus = { enabled: false, error: error.message };
    }

    // Elastic
    if (process.env.ELASTIC_NODE) {
      try {
        const elasticSummary = await getMetricsSummary();
        result.sources.elastic = {
          enabled: true,
          data: elasticSummary
        };
      } catch (error) {
        result.sources.elastic = { enabled: false, error: error.message };
      }
    } else {
      result.sources.elastic = { enabled: false };
    }

    // Sentry
    result.sources.sentry = {
      enabled: !!process.env.SENTRY_DSN
    };

    res.json(result);
  } catch (error) {
    console.error('[API] Erro ao consolidar dados:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Resumo de métricas (últimas 24h)
 * GET /api/metrics/summary
 */
app.get('/api/metrics/summary', async (req, res) => {
  try {
    // Se Elastic estiver habilitado, retornar dados do Elastic
    if (process.env.ELASTIC_NODE) {
      const elasticSummary = await getMetricsSummary();
      return res.json({
        source: 'elastic',
        data: elasticSummary,
        timestamp: new Date().toISOString()
      });
    }

    // Fallback: retornar estrutura básica
    res.json({
      source: 'prometheus',
      message: 'Use /metrics para dados Prometheus ou configure ELASTIC_NODE',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Erro ao buscar summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Estatísticas detalhadas de um alvo
 * GET /api/metrics/:targetName
 */
app.get('/api/metrics/:targetName', async (req, res) => {
  try {
    const { targetName } = req.params;

    if (process.env.ELASTIC_NODE) {
      const stats = await getTargetStats(targetName);
      return res.json({
        source: 'elastic',
        target: targetName,
        stats,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      source: 'prometheus',
      target: targetName,
      message: 'Configure ELASTIC_NODE para estatísticas detalhadas',
      endpoint: 'http://localhost:9090'
    });
  } catch (error) {
    console.error('[API] Erro ao buscar stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Dados do Prometheus em JSON
 * GET /api/prometheus
 */
app.get('/api/prometheus', async (req, res) => {
  try {
    const metricsText = await getMetricsAsPrometheus();
    const lines = metricsText.split('\n');
    
    // Parsear métricas básicas
    const metrics = {};
    lines.forEach(line => {
      if (!line.startsWith('#') && line.trim()) {
        const parts = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(.*?)\s(\d+(?:\.\d+)?)$/);
        if (parts) {
          metrics[parts[1]] = parseFloat(parts[3]);
        }
      }
    });

    res.json({
      source: 'prometheus',
      metrics,
      endpoint: 'http://localhost:9090',
      grafana: 'http://localhost:3000'
    });
  } catch (error) {
    console.error('[API] Erro ao parsear Prometheus:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Dados do Elastic
 * GET /api/elastic/summary
 */
app.get('/api/elastic/summary', async (req, res) => {
  try {
    if (!process.env.ELASTIC_NODE) {
      return res.status(503).json({
        error: 'Elastic não configurado',
        message: 'Configure ELASTIC_NODE para usar Elastic'
      });
    }

    const summary = await getMetricsSummary();
    res.json({
      source: 'elastic',
      summary,
      kibana: 'http://localhost:5601',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Erro ao buscar Elastic summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Status do Sentry
 * GET /api/sentry/status
 */
app.get('/api/sentry/status', (req, res) => {
  res.json({
    enabled: !!process.env.SENTRY_DSN,
    dsn: process.env.SENTRY_DSN ? process.env.SENTRY_DSN.substring(0, 30) + '...' : 'not-configured',
    url: 'https://sentry.io/',
    message: 'Para dados do Sentry, acesse seu dashboard em https://sentry.io/'
  });
});

/**
 * API: Comparação entre APMs
 * GET /api/apms/comparison
 */
app.get('/api/apms/comparison', async (req, res) => {
  const comparison = {
    timestamp: new Date().toISOString(),
    apms: [
      {
        name: 'Prometheus + Grafana',
        status: 'active',
        endpoints: {
          prometheus: 'http://localhost:9090',
          grafana: 'http://localhost:3000',
          metrics: '/metrics'
        },
        features: [
          'Coleta de métricas',
          'Time-series database',
          'Alertas customizáveis',
          'Dashboards em tempo real'
        ],
        complexity: 'medium'
      },
      {
        name: 'Elastic Stack (ELK)',
        status: process.env.ELASTIC_NODE ? 'active' : 'inactive',
        endpoints: {
          elasticsearch: process.env.ELASTIC_NODE || 'not-configured',
          kibana: 'http://localhost:5601'
        },
        features: [
          'Logs centralizados',
          'Análise full-text',
          'Métricas e traces',
          'Machine Learning integrado'
        ],
        complexity: 'high'
      },
      {
        name: 'Sentry',
        status: process.env.SENTRY_DSN ? 'active' : 'inactive',
        endpoints: {
          sentry: 'https://sentry.io/'
        },
        features: [
          'Error tracking',
          'Performance monitoring',
          'Release tracking',
          'Alertas'
        ],
        complexity: 'low'
      }
    ]
  };

  res.json(comparison);
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    apms: {
      prometheus: true,
      elastic: !!process.env.ELASTIC_NODE,
      sentry: !!process.env.SENTRY_DSN
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de métricas rodando em http://localhost:${PORT}`);
  console.log(`📊 Prometheus: http://localhost:${PORT}/metrics`);
  console.log(`📈 API Status: http://localhost:${PORT}/api/status`);
  console.log(`🔍 Comparação APMs: http://localhost:${PORT}/api/apms/comparison`);
});
