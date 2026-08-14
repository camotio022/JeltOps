# 🚀 JeltOps - Projeto Acadêmico de Comparação de APMs

## 📚 Visão Geral

JeltOps é um **projeto acadêmico** que integra **Firestore com 3 APMs diferentes** para monitoramento completo de infraestrutura:

1. **Firestore** - Banco de dados (dados históricos)
2. **Prometheus + Grafana** - Metrics-based monitoring
3. **Elastic Stack (ELK)** - Full stack logs + metrics + traces  
4. **Sentry** - Error tracking + performance monitoring

O objetivo é **coletar e comparar dados** de todas as fontes em um dashboard unificado.

---

## 🏗️ Arquitetura do Projeto

```
┌──────────────────────────────────────────────────────────┐
│            JeltOps Backend + Monitor                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │  monitor.js - Verificação de uptime dos alvos    │ │
│  │  - Coleta latência, status HTTP, uptime          │ │
│  │  - Salva SIMULTANEAMENTE em:                      │ │
│  │    ✓ Firestore (histórico)                       │ │
│  │    ✓ Prometheus (métricas em tempo real)         │ │
│  │    ✓ Elasticsearch (logs indexados)              │ │
│  │    ✓ Sentry (erros e performance)                │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
    │                    │                 │              │
    │                    │                 │              │
    ▼                    ▼                 ▼              ▼
┌─────────┐      ┌────────────┐   ┌──────────────┐  ┌─────────┐
│ Firestore│      │ Prometheus │   │ Elasticsearch│  │ Sentry  │
│(histórico)│      │ + Grafana   │   │ + Kibana     │  │ Cloud   │
└────┬────┘      └─────┬──────┘   └──────┬───────┘  └────┬────┘
     │                 │                  │              │
     └─────────────────┼──────────────────┼──────────────┘
                       │
              ┌────────▼────────┐
              │  React Dashboard │
              │  (Consolidado)   │
              └──────────────────┘
```

---

## ✨ Fluxo de Dados

```
1. monitor.js executa check de uptime
   ↓
2. Salva em Firestore (Firebase Cloud Firestore)
   ↓
3. Exporta para Prometheus (prom-client)
   ↓
4. Indexa em Elasticsearch (elastic-client)
   ↓
5. Registra em Sentry (SDK)
   ↓
6. React Dashboard consome todas as 4 fontes
```

---

## 📁 Estrutura de Arquivos

```
JeltOps/
├── backend/
│   ├── monitor.js                    # 🔄 Monitor principal (Firestore + APMs)
│   ├── server.js                     # APIs consolidadas
│   ├── prometheus-exporter.js        # Exportador Prometheus
│   ├── elastic-exporter.js           # Cliente Elasticsearch
│   ├── sentry-exporter.js            # SDK Sentry
│   ├── queue.js                      # Fila de processamento
│   ├── worker.js                     # Worker de background
│   └── serviceAccountKey.json        # Credenciais Firebase
│
├── src/
│   ├── components/
│   │   └── APMComparison.jsx         # Painel de comparação
│   ├── styles/
│   │   └── APMComparison.css
│   ├── App.jsx                       # App principal (Firestore)
│   ├── App.css
│   ├── main.jsx
│   ├── index.css
│   └── firebaseConfig.js
│
├── public/
├── docker-compose.yml                # Stack Docker (Prometheus, Elastic, Kibana)
├── prometheus.yml                    # Config Prometheus
├── alert_rules.yml                   # Alertas Prometheus
├── .env.example                      # Variáveis de ambiente
├── ANALISE_APMS.md                   # Análise técnica
├── SETUP_APMS.md                     # Guia de setup
├── README.md                         # README original
├── README_APMS.md                    # Este arquivo
├── package.json
├── pnpm-lock.yaml
└── vite.config.js
```

---

## 🚀 Como Começar

### Pré-requisitos
- Node.js 18+
- Docker e Docker Compose
- Firebase project (para Firestore)

### 1. Instalação

```bash
cd JeltOps
pnpm install
cp .env.example .env
```

### 2. Configurar Firestore
1. Criar projeto em [Firebase Console](https://console.firebase.google.com/)
2. Baixar `serviceAccountKey.json`
3. Salvar em `backend/serviceAccountKey.json`

### 3. Iniciar (3 terminais)

**Terminal 1: Backend**
```bash
cd backend
node monitor.js &        # Começa a monitorar e exportar para todos os APMs
node server.js           # Servidor com APIs consolidadas (porta 3001)
```

**Terminal 2: Frontend**
```bash
pnpm dev                 # Inicia Vite (porta 5173)
```

**Terminal 3: Docker Compose**
```bash
docker-compose up        # Sobe Prometheus, Grafana, Elasticsearch, Kibana
```

---

## 🔌 APIs Disponíveis

### Dados Consolidados
```bash
# Todos os dados de todas as 4 fontes
GET http://localhost:3001/api/data/all

# Apenas dados do Firestore
GET http://localhost:3001/api/data/firestore
```

### Prometheus
```bash
# Formato Prometheus (para scraper)
GET http://localhost:3001/metrics

# Formato JSON
GET http://localhost:3001/api/prometheus
```

### Elastic
```bash
# Resumo
GET http://localhost:3001/api/elastic/summary

# Estatísticas por alvo
GET http://localhost:3001/api/metrics/:targetName
```

### Sentry
```bash
# Status
GET http://localhost:3001/api/sentry/status
```

### Comparação
```bash
# Análise de todos os APMs
GET http://localhost:3001/api/apms/comparison
```

---

## 🎯 Workflow Completo

### Exemplo: Monitor coleta status de YouTube

```javascript
// 1. monitor.js faz fetch
const response = await fetch('https://www.youtube.com');

// 2. Resultado: status=UP, latency=145ms

// 3. Salva em Firestore
db.collection('metrics_logs').add({
  target: 'YouTube Main API',
  url: 'https://www.youtube.com',
  status: 'UP',
  latencyMs: 145,
  statusCode: 200,
  timestamp: FieldValue.serverTimestamp()
});

// 4. Exporta para Prometheus
recordMetric(target, 'UP', 145, 200, previousStatus, null);

// 5. Indexa em Elasticsearch
await indexMetric({
  target_name: 'YouTube Main API',
  url: 'https://www.youtube.com',
  status: 'UP',
  latency_ms: 145,
  status_code: 200
});

// 6. Registra em Sentry
sentryRecordHealthCheck({
  target_name: 'YouTube Main API',
  url: 'https://www.youtube.com',
  status: 'UP',
  latency_ms: 145,
  status_code: 200
});

// 7. React Dashboard consulta /api/data/all
// Recebe dados de TODAS as 4 fontes!
```

---

## 📊 Dashboard React

### Visualizações Disponíveis

**Aba 1: Firestore (Dados Históricos)**
- Tabela de métricas
- Gráfico de latência
- Status atual dos alvos

**Aba 2: Prometheus**
- Métricas em tempo real
- Dashboards Grafana
- Alertas

**Aba 3: Elastic**
- Logs indexados
- Análises avançadas
- Visualizações Kibana

**Aba 4: Sentry**
- Erros capturados
- Performance monitoring
- Health checks

**Aba 5: Comparativo**
- Lado a lado dos 4 APMs
- Performance de cada um
- Qual usar e por quê

---

## 🔧 Configuração

### .env
```bash
# Sentry (opcional)
SENTRY_DSN=https://xxxx@sentry.io/xxxx

# Elastic (opcional)
ELASTIC_NODE=http://localhost:9200
ELASTIC_USERNAME=elastic
ELASTIC_PASSWORD=changeme

# Firebase (obrigatório)
FIREBASE_PROJECT_ID=seu-projeto
```

### prometheus.yml
- Scrape de `http://localhost:3001/metrics` a cada 10s
- Alertas em `alert_rules.yml`

### docker-compose.yml
- Prometheus na porta 9090
- Grafana na porta 3000 (admin/admin)
- Elasticsearch na porta 9200
- Kibana na porta 5601

---

## 📈 Métricas Coletadas

### De todas as fontes:
- **Status**: UP / DOWN
- **Latência**: em ms
- **Status Code**: HTTP code (200, 500, etc)
- **Timestamp**: quando foi coletado
- **Alvo**: nome e URL

### Prometheus adiciona:
- Histogramas de latência
- Taxa de erros
- Mudanças de status
- Contadores por alvo

### Elastic adiciona:
- Análises full-text
- Agregações por período
- Índices para query rápida

### Sentry adiciona:
- Rastreamento de performance
- Stack traces (se erro)
- Breadcrumbs de eventos

---

## 🎓 Análise Comparativa

| Aspecto | Firestore | Prometheus | Elastic | Sentry |
|---------|-----------|-----------|---------|--------|
| **Tipo** | NoSQL | Metrics | Full Stack | Error Tracking |
| **Setup** | SaaS | Docker | Docker | SaaS |
| **Custo** | Pago | Gratuito | Gratuito | Freemium |
| **Melhor para** | Histórico | Tempo real | Análise | Erros |
| **Query** | Firestore SDK | PromQL | Kibana | Web UI |
| **Realismo** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 🚀 Próximos Passos

1. ✅ Integrar Firestore + Prometheus + Elastic + Sentry
2. ✅ APIs consolidadas funcionando
3. ⏳ Dashboard mostrando dados de TODAS as 4 fontes
4. ⏳ Comparação visual em tempo real
5. ⏳ Análise acadêmica final

---

## 📚 Documentação Adicional

- [ANALISE_APMS.md](ANALISE_APMS.md) - Análise técnica detalhada
- [SETUP_APMS.md](SETUP_APMS.md) - Guia passo-a-passo
- [README.md](README.md) - README original

---

## 🎯 Conclusão Recomendada

Para um projeto acadêmico completo:

**Use Firestore + Prometheus**
- Firestore: histórico e dados originais
- Prometheus: monitoramento em tempo real
- Grafana: dashboards profissionais
- Consolidar no React: melhor experiência

Isso demonstra conhecimento de:
- Database (Firestore)
- Monitoring (Prometheus)
- Visualization (Grafana + React)
- DevOps (Docker Compose)

Perfect para uma apresentação acadêmica! 🎓

