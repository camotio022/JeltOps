# 📡 Integração Firestore + APMs - Documentação Técnica

## Visão Geral da Integração

JeltOps agora funciona com **Firestore como fonte primária** e **3 APMs como exportadores paralelos**:

```
monitor.js
   ↓
   ├─→ Firestore (dados históricos)
   ├─→ Prometheus (métricas em tempo real)
   ├─→ Elasticsearch (logs indexados)
   └─→ Sentry (erros e performance)
```

---

## 1. Firestore (Fonte Primária)

### O que é
- Banco de dados NoSQL do Firebase
- Guarda histórico completo de todas as métricas
- Usado pela App React original

### Como funciona no JeltOps
```javascript
// backend/monitor.js
const logsRef = db.collection('metrics_logs');
await logsRef.add({
  target: 'YouTube Main API',
  url: 'https://www.youtube.com',
  status: 'UP',
  latencyMs: 145,
  statusCode: 200,
  timestamp: FieldValue.serverTimestamp()
});
```

### Vantagens
- ✅ Dados persistentes e historicamente completos
- ✅ Queries flexíveis com Firestore SDK
- ✅ Integração fácil com React
- ✅ Real-time listeners disponíveis

### Limitações
- ❌ Menos adequado para séries temporais
- ❌ Queries complexas são limitadas
- ❌ Sem vizualização nativa (precisa React)

---

## 2. Prometheus (Exportador de Métricas)

### O que é
- Sistema de monitoramento de código aberto
- Especializado em time-series de métricas
- Usa seu próprio formato de texto

### Como funciona no JeltOps
```javascript
// backend/monitor.js
import { recordMetric } from './prometheus-exporter.js';

recordMetric(target, status, latency, statusCode, previousStatus, error);
```

### Métricas Exportadas
```
jeltops_target_status              # 1=UP, 0=DOWN (Gauge)
jeltops_target_latency_ms          # Latência em ms (Histogram)
jeltops_http_status_code           # Contagem por code (Counter)
jeltops_checks_total               # Total de checks (Counter)
jeltops_status_changes_total       # Mudanças de status (Counter)
jeltops_request_errors_total       # Erros (Counter)
```

### Endpoint
```
GET http://localhost:3001/metrics
```

### Visualização
- Prometheus UI: http://localhost:9090
- Grafana: http://localhost:3000

### Vantagens
- ✅ Otimizado para time-series
- ✅ PromQL é muito poderoso
- ✅ Padrão da indústria (Kubernetes, Docker)
- ✅ Alertas nativos

### Limitações
- ❌ Sem histórico muito longo (usa RAM)
- ❌ Formato texto é específico
- ❌ Precisa de Grafana para visualizar

---

## 3. Elasticsearch (Exportador de Logs)

### O que é
- Engine de busca e análise em tempo real
- Especializado em logs e dados estruturados
- Usa Kibana para visualização

### Como funciona no JeltOps
```javascript
// backend/monitor.js
import { indexMetric } from './elastic-exporter.js';

await indexMetric({
  target_name: 'YouTube Main API',
  url: 'https://www.youtube.com',
  status: 'UP',
  latency_ms: 145,
  status_code: 200
});
```

### Índices Criados
```
jeltops-metrics    # Métricas indexadas
jeltops-logs       # Logs estruturados
```

### Endpoint
```
GET http://localhost:9200/_search
```

### Visualização
- Kibana: http://localhost:5601

### Vantagens
- ✅ Busca full-text poderosa
- ✅ Análises complexas com agregações
- ✅ Machine Learning integrado
- ✅ Escalável para grandes volumes

### Limitações
- ❌ Setup mais complexo
- ❌ Consome mais recursos
- ❌ Curva de aprendizado maior

---

## 4. Sentry (Exportador de Erros e Performance)

### O que é
- Plataforma SaaS de error tracking
- Monitora erros e performance
- Cloud-hosted (https://sentry.io)

### Como funciona no JeltOps
```javascript
// backend/monitor.js
import { recordHealthCheck } from './sentry-exporter.js';

sentryRecordHealthCheck({
  target_name: 'YouTube Main API',
  url: 'https://www.youtube.com',
  status: 'UP',
  latency_ms: 145,
  status_code: 200
});
```

### O que é rastreado
- ✓ Health checks (status UP/DOWN)
- ✓ Exceções (se ocorrerem erros)
- ✓ Performance traces
- ✓ Breadcrumbs (histórico de eventos)

### Endpoint
```
https://sentry.io/
```

### Vantagens
- ✅ Setup muito rápido
- ✅ SaaS (sem setup de servidor)
- ✅ Free tier robusto
- ✅ Interface amigável

### Limitações
- ❌ Menos dados de infraestrutura
- ❌ Free tier limitado
- ❌ Dependência de internet

---

## 📊 Comparação: Quando usar cada um

| Cenário | Firestore | Prometheus | Elastic | Sentry |
|---------|-----------|-----------|---------|--------|
| **Histórico completo** | ✅✅✅ | ❌ | ✅✅ | ❌ |
| **Tempo real** | ✅ | ✅✅✅ | ✅✅ | ✅ |
| **Séries temporais** | ❌ | ✅✅✅ | ✅ | ❌ |
| **Busca full-text** | ❌ | ❌ | ✅✅✅ | ❌ |
| **Erros/Exceções** | ❌ | ❌ | ❌ | ✅✅✅ |
| **Alertas** | ❌ | ✅✅✅ | ✅✅ | ✅ |
| **Dashboards** | ❌ | ✅ (Grafana) | ✅ (Kibana) | ✅ |
| **Escalabilidade** | ✅ (Cloud) | ⚠️ (RAM) | ✅✅ | ✅ (Cloud) |

---

## 🔄 Fluxo de Exportação

### Quando monitor.js faz um check:

```
1. Inicia verificação
   └─ GET https://www.youtube.com
   └─ Mede latência (145ms)
   └─ Recebe status (200)

2. Determina result
   └─ status = 'UP' (pois 200 < 400)
   └─ latency = 145ms

3. Salva em Firestore
   └─ collection('metrics_logs').add({...})

4. Exporta para Prometheus
   └─ recordMetric(target, 'UP', 145, 200)
   └─ Atualiza gauges e histogramas

5. Indexa em Elasticsearch
   └─ indexMetric({...})
   └─ Cria documento no índice

6. Registra em Sentry
   └─ sentryRecordHealthCheck({...})
   └─ Envia para https://sentry.io

7. Logger
   └─ console.log('[Monitor] Sucesso! Log salvo: ...')
```

Tudo acontece **sequencialmente** (await) para garantir consistência.

---

## 🔗 APIs de Consolidação

### GET /api/data/all
Retorna dados de **TODAS as 4 fontes**:

```json
{
  "timestamp": "2026-08-13T10:30:00Z",
  "sources": {
    "firestore": {
      "enabled": true,
      "count": 30,
      "data": [
        { "target": "YouTube Main API", "status": "UP", "latencyMs": 145 },
        ...
      ]
    },
    "prometheus": {
      "enabled": true,
      "metricsRaw": "# HELP jeltops_target_status Status do alvo..."
    },
    "elastic": {
      "enabled": true,
      "data": [...]
    },
    "sentry": {
      "enabled": true
    }
  }
}
```

### GET /api/data/firestore
Retorna apenas dados do Firestore (últimas 50):

```json
{
  "source": "firestore",
  "count": 50,
  "data": [...],
  "timestamp": "2026-08-13T10:30:00Z"
}
```

---

## 📡 Como React consome os dados

### Componente APMComparison.jsx
```javascript
// Buscar dados consolidados
const response = await fetch('http://localhost:3001/api/data/all');
const data = await response.json();

// Acessar cada fonte
const firestoreData = data.sources.firestore.data;
const prometheusMetrics = data.sources.prometheus.metricsRaw;
const elasticData = data.sources.elastic.data;
```

### App.jsx (Original - Firestore)
```javascript
// Listener em tempo real do Firestore
const q = query(
  collection(db, "metrics_logs"),
  orderBy("timestamp", "desc"),
  limit(40)
);

onSnapshot(q, (snapshot) => {
  // Atualiza UI com dados do Firestore
});
```

---

## 🚀 Configuração Necessária

### 1. Firestore
- Criar projeto Firebase
- Habilitar Firestore
- Baixar `serviceAccountKey.json`

### 2. Prometheus
```bash
docker-compose up prometheus -d
# Acesso: http://localhost:9090
```

### 3. Elasticsearch
```bash
docker-compose up elasticsearch kibana -d
# Kibana: http://localhost:5601
```

### 4. Sentry
- Criar conta em https://sentry.io
- Criar projeto Node.js
- Copiar DSN para .env

### 5. Backend
```bash
cd backend
node monitor.js &
node server.js
```

### 6. Frontend
```bash
pnpm dev
```

---

## 📈 Exemplo Prático

### Cenário: YouTube está DOWN

```
Monitoramento detecta:
status = 'DOWN'
statusCode = 500
latency = 5000ms

↓

Firestore recebe:
{
  target: "YouTube Main API",
  status: "DOWN",
  statusCode: 500,
  latencyMs: 5000,
  timestamp: <now>
}

↓

Prometheus atualiza:
jeltops_target_status{target_name="YouTube Main API"} = 0
jeltops_target_latency_ms{...} = 5000
jeltops_request_errors_total{...} += 1

↓

Elasticsearch indexa:
{
  "target_name": "YouTube Main API",
  "status": "DOWN",
  "latency_ms": 5000,
  "@timestamp": <now>
}

↓

Sentry registra:
[WARNING] Health check: YouTube Main API is DOWN
+ tags: status=DOWN, status_code=500
+ context: url=https://www.youtube.com, latency_ms=5000

↓

React Dashboard mostra:
- Firestore: histórico completo (em tabela)
- Prometheus: alerta visual (vermelho)
- Elastic: análise (% downtime nos últimos 24h)
- Sentry: notificação (se habilitado)
```

---

## ✅ Vantagens da Arquitetura Integrada

1. **Redundância** - Dados em 4 lugares diferentes
2. **Complementaridade** - Cada um tem seu propósito
3. **Realismo** - Assim funciona em empresas reais
4. **Flexibilidade** - Use o que precisar
5. **Aprendizado** - Conhece 4 tecnologias diferentes

---

## 🎓 Conclusão para Projeto Acadêmico

Essa integração demonstra:
- ✅ Conhecimento de **Database** (Firestore)
- ✅ Conhecimento de **Monitoring** (Prometheus)
- ✅ Conhecimento de **Log Management** (Elastic)
- ✅ Conhecimento de **Error Tracking** (Sentry)
- ✅ Conhecimento de **Architecture** (integração)
- ✅ Conhecimento de **DevOps** (Docker, APIs)

**Perfeito para uma apresentação acadêmica! 🎓**

