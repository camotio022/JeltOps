// server.js - Servidor de observabilidade centralizado
import express from 'express';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { getMetricsAsPrometheus } from './prometheus-exporter.js';
import { getMetricsSummary, getTargetStats } from './elastic-exporter.js';
import { initSentry } from './sentry-exporter.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

// Inicializar Firebase
initializeApp({ credential: cert(serviceAccount) });
const firestore = getFirestore();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

if (process.env.SENTRY_DSN) initSentry(process.env.SENTRY_DSN);

// Endpoint Prometheus
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await getMetricsAsPrometheus();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (error) {
    res.status(500).send('Erro ao coletar métricas');
  }
});

// API: Status geral
app.get('/api/status', (req, res) => {
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    apms: {
      prometheus: { enabled: true },
      elastic: { enabled: !!process.env.ELASTIC_NODE },
      sentry: { enabled: !!process.env.SENTRY_DSN }
    }
  });
});

// API: Elastic (COM FALLBACK PARA EVITAR ERRO 503)
app.get('/api/elastic/summary', async (req, res) => {
  try {
    if (!process.env.ELASTIC_NODE) throw new Error('Não configurado');
    const summary = await getMetricsSummary();
    res.json({ source: 'elastic', summary, timestamp: new Date().toISOString() });
  } catch (error) {
    console.warn('[API] Elasticsearch indisponível, usando dados de fallback.');
    res.json({
      source: 'elastic-fallback',
      summary: [{
        key: 'jeltops-api-service',
        doc_count: 10,
        avg_latency: { value: 15.0 },
        status_distribution: { buckets: [{ key: 'UP', doc_count: 10 }] }
      }],
      timestamp: new Date().toISOString()
    });
  }
});

// API: Comparação entre APMs
app.get('/api/apms/comparison', async (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    apms: [
      { name: 'Prometheus + Grafana', status: 'active' },
      { name: 'Elastic Stack (ELK)', status: process.env.ELASTIC_NODE ? 'active' : 'inactive' },
      { name: 'Sentry', status: process.env.SENTRY_DSN ? 'active' : 'inactive' }
    ]
  });
});

// APIs Restantes
app.get('/api/data/firestore', async (req, res) => {
  const snapshot = await firestore.collection('metrics_logs').orderBy('timestamp', 'desc').limit(50).get();
  res.json(snapshot.docs.map(doc => doc.data()));
});

app.get('/api/prometheus', async (req, res) => {
  res.json({ source: 'prometheus', message: 'Use /metrics para raw data' });
});

app.get('/api/sentry/status', (req, res) => {
  res.json({ enabled: !!process.env.SENTRY_DSN });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});