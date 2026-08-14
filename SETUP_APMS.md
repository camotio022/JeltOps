# SETUP_APMS.md - Guia de Setup para os 3 APMs

## 📋 Índice
1. [Pré-requisitos](#pré-requisitos)
2. [Fase 1: Prometheus](#fase-1-prometheus)
3. [Fase 2: Elastic Stack](#fase-2-elastic-stack)
4. [Fase 3: Sentry](#fase-3-sentry)
5. [Testing](#testing)

---

## Pré-requisitos

- Node.js 18+ instalado
- Docker e Docker Compose instalados (para rodar APMs)
- npm ou pnpm

### Instalação de dependências

```bash
# Instalar dependências do projeto
pnpm install

# Ou com npm
npm install
```

---

## Fase 1: Prometheus

### 1.1 Setup Prometheus com Docker Compose

```bash
# Subir apenas Prometheus e Grafana
docker-compose up prometheus grafana -d
```

### 1.2 Iniciar o servidor JeltOps

O servidor Express expõe métricas em `http://localhost:3001/metrics`:

```bash
# Terminal 1: Rodar monitor.js
node backend/monitor.js

# Terminal 2: Rodar servidor de métricas
node backend/server.js
```

### 1.3 Acessar Prometheus

- **URL:** http://localhost:9090
- **Status:** Você verá o target `jeltops` como ativo

### 1.4 Acessar Grafana

- **URL:** http://localhost:3000
- **Username:** admin
- **Password:** admin

#### Adicionar Prometheus como Data Source:
1. Settings → Data Sources → Add data source
2. Selecionar Prometheus
3. URL: `http://prometheus:9090`
4. Clicar em "Save & test"

#### Criar Dashboard:
1. Create → Dashboard → Add panel
2. Metric: `jeltops_target_status` (mostra UP/DOWN)
3. Customizar visualização

### 1.5 Métricas disponíveis

```promql
# Status dos alvos (1=UP, 0=DOWN)
jeltops_target_status{target_name="YouTube Main API"}

# Latência
jeltops_target_latency_ms_sum / jeltops_target_latency_ms_count

# Taxa de erro
rate(jeltops_request_errors_total[5m])

# Status codes
jeltops_http_status_code
```

---

## Fase 2: Elastic Stack

### 2.1 Setup Elasticsearch + Kibana

```bash
# Subir Elasticsearch e Kibana
docker-compose up elasticsearch kibana -d

# Aguarde 30-60 segundos até Elasticsearch estar pronto
```

### 2.2 Configurar monitor.js para usar Elastic

Modificar `backend/monitor.js` para importar e usar `elastic-exporter.js`:

```javascript
import { indexMetric, indexLog } from './elastic-exporter.js';

// Dentro de runCheck():
if (shouldSave) {
  // Manter Firebase
  await logsRef.add({ ... });
  
  // Adicionar Elastic
  await indexMetric({
    target_name: target.name,
    url: target.url,
    status: status,
    latency_ms: latency,
    status_code: statusCode
  });
}
```

### 2.3 Acessar Kibana

- **URL:** http://localhost:5601
- **Sem autenticação** (XPack desabilitado)

#### Visualizar dados:
1. Discover → Selecionar índice `jeltops-metrics`
2. Visualizar logs em tempo real
3. Criar visualizações (charts, heatmaps)

#### Criar Dashboard:
1. Dashboards → Create dashboard
2. Add panels → Visualizations
3. Filtrar por target_name, status, etc

### 2.4 Queries úteis (Kibana Console)

```json
// Ver últimas 100 métricas
GET jeltops-metrics/_search
{
  "size": 100,
  "query": {
    "match_all": {}
  },
  "sort": [{ "timestamp": "desc" }]
}

// Agregação por status
GET jeltops-metrics/_search
{
  "aggs": {
    "status_distribution": {
      "terms": { "field": "status" }
    }
  }
}
```

---

## Fase 3: Sentry

### 3.1 Criar conta Sentry

1. Ir em https://sentry.io/
2. Criar conta grátis
3. Criar novo projeto → "Node.js"
4. Copiar o **DSN**

### 3.2 Configurar variável de ambiente

```bash
# No arquivo .env
SENTRY_DSN=https://xxxx@sentry.io/xxxx
```

### 3.3 Modificar monitor.js para usar Sentry

```javascript
import { initSentry, captureException, recordHealthCheck } from './sentry-exporter.js';

// No início
initSentry(process.env.SENTRY_DSN);

// Dentro de runCheck():
try {
  const response = await fetch(target.url);
  // ... lógica
  recordHealthCheck({
    target_name: target.name,
    url: target.url,
    status: status,
    latency_ms: latency,
    status_code: statusCode
  });
} catch (error) {
  captureException(error, {
    target_name: target.name,
    url: target.url
  });
}
```

### 3.4 Acessar Sentry Dashboard

- **URL:** https://sentry.io/
- Seu projeto aparecerá no painel
- Eventos de erro/performance serão rastreados

### 3.5 Features do Sentry

- **Issues:** Lista de erros agrupados
- **Performance:** Traces de requisições
- **Releases:** Rastrear versões de código
- **Alerts:** Notificações customizadas

---

## Testing

### Teste 1: Prometheus

```bash
# 1. Iniciar tudo
docker-compose up prometheus grafana server -d
node backend/monitor.js &
node backend/server.js

# 2. Esperar 1-2 minutos
# 3. Acessar http://localhost:9090
# 4. Buscar: jeltops_target_status
# 5. Deve mostrar métricas sendo coletadas
```

### Teste 2: Elastic

```bash
# 1. Subir Elasticsearch
docker-compose up elasticsearch kibana -d
sleep 30

# 2. Iniciar servidor com Elastic habilitado
ELASTIC_NODE=http://localhost:9200 node backend/server.js &

# 3. Acessar http://localhost:5601
# 4. Discover → jeltops-metrics
# 5. Deve mostrar documentos chegando
```

### Teste 3: Sentry

```bash
# 1. Configurar SENTRY_DSN
export SENTRY_DSN="https://seu-dsn@sentry.io/xxx"

# 2. Iniciar servidor
node backend/server.js

# 3. Acessar seu dashboard Sentry
# 4. Deve ver eventos de health check
```

### Teste 4: Simular erro

```bash
# Modificar um target para URL inválida
const targets = [
  { name: "Bad Target", url: "http://invalid-url-12345.com" }
];

# Rodar
node backend/monitor.js

# Ver erros em:
# - Prometheus: jeltops_request_errors_total
# - Elastic: jeltops-logs índice
# - Sentry: Issues → seu projeto
```

---

## Troubleshooting

### Prometheus não vê métricas
- Verificar se `/metrics` endpoint está respondendo: `curl http://localhost:3001/metrics`
- Verificar logs do server: `node backend/server.js 2>&1`

### Elasticsearch connection refused
- Aguardar Elasticsearch iniciar: `docker logs jeltops-elasticsearch`
- Verificar porta: `curl http://localhost:9200`

### Sentry não recebe eventos
- Verificar DSN: `echo $SENTRY_DSN`
- Ver logs de erro no console
- Verificar https://status.sentry.io/

### Docker compose não funciona
```bash
# Limpar e recomeçar
docker-compose down -v
docker-compose up --build
```

---

## Próximos passos

1. ✅ Implementar Prometheus (Fase 1)
2. ⏳ Implementar Elastic (Fase 2)
3. ⏳ Implementar Sentry (Fase 3)
4. ⏳ Atualizar React dashboard para mostrar dados dos 3 APMs
5. ⏳ Documentação comparativa final
