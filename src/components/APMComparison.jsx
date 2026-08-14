// src/components/APMComparison.jsx - Painel comparativo dos 3 APMs

import { useEffect, useState } from 'react';
import '../styles/APMComparison.css';

function APMComparison() {
  const [apmStatus, setApmStatus] = useState({
    prometheus: { enabled: false, latency: 0, status: 'checking' },
    elastic: { enabled: false, latency: 0, status: 'checking' },
    sentry: { enabled: false, latency: 0, status: 'checking' }
  });

  const [comparison, setComparison] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    // Buscar dados de comparação
    const fetchComparison = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/apms/comparison');
        const data = await response.json();
        setComparison(data);

        // Testar latência de cada APM
        await testAPMLatencies();
      } catch (error) {
        console.error('Erro ao buscar comparação:', error);
      }
    };

    const testAPMLatencies = async () => {
      const newStatus = { ...apmStatus };

      // Teste Prometheus
      try {
        const start = performance.now();
        const resp = await fetch('http://localhost:9090/api/v1/status/config', { signal: AbortSignal.timeout(5000) });
        const latency = performance.now() - start;
        newStatus.prometheus = {
          enabled: resp.ok,
          latency: Math.round(latency),
          status: resp.ok ? 'online' : 'offline'
        };
      } catch (error) {
        newStatus.prometheus = { enabled: false, latency: 0, status: 'offline' };
      }

      // Teste Elastic
      try {
        const start = performance.now();
        const resp = await fetch('http://localhost:9200/', { signal: AbortSignal.timeout(5000) });
        const latency = performance.now() - start;
        newStatus.elastic = {
          enabled: resp.ok,
          latency: Math.round(latency),
          status: resp.ok ? 'online' : 'offline'
        };
      } catch (error) {
        newStatus.elastic = { enabled: false, latency: 0, status: 'offline' };
      }

      // Teste Sentry
      try {
        const start = performance.now();
        const resp = await fetch('http://localhost:3001/api/sentry/status', { signal: AbortSignal.timeout(5000) });
        const latency = performance.now() - start;
        const data = await resp.json();
        newStatus.sentry = {
          enabled: data.enabled,
          latency: Math.round(latency),
          status: data.enabled ? 'online' : 'offline'
        };
      } catch (error) {
        newStatus.sentry = { enabled: false, latency: 0, status: 'offline' };
      }

      setApmStatus(newStatus);
    };

    fetchComparison();
    const interval = setInterval(testAPMLatencies, 30000); // Testar a cada 30s
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return '#10b981';
      case 'offline': return '#ef4444';
      case 'checking': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'online': return '🟢 Online';
      case 'offline': return '🔴 Offline';
      case 'checking': return '🟡 Checking';
      default: return '⚪ Unknown';
    }
  };

  return (
    <div className="apm-comparison-panel">
      <div className="apm-header">
        <h1>🔍 Comparação de APMs</h1>
        <p>Análise comparativa de 3 soluções de monitoring para JeltOps</p>
      </div>

      {/* Abas de navegação */}
      <div className="apm-tabs">
        <button 
          className={`tab-btn ${selectedTab === 'overview' ? 'active' : ''}`}
          onClick={() => setSelectedTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab-btn ${selectedTab === 'detailed' ? 'active' : ''}`}
          onClick={() => setSelectedTab('detailed')}
        >
          Análise Detalhada
        </button>
        <button 
          className={`tab-btn ${selectedTab === 'endpoints' ? 'active' : ''}`}
          onClick={() => setSelectedTab('endpoints')}
        >
          Endpoints
        </button>
      </div>

      {/* TAB 1: Overview */}
      {selectedTab === 'overview' && (
        <div className="apm-overview">
          <div className="apm-grid">
            {/* Card Prometheus */}
            <div className="apm-card prometheus">
              <div className="card-header">
                <h2>📊 Prometheus + Grafana</h2>
                <span className="status-indicator" style={{ backgroundColor: getStatusColor(apmStatus.prometheus.status) }}>
                  {getStatusLabel(apmStatus.prometheus.status)}
                </span>
              </div>
              <div className="card-body">
                <p className="description">Metrics-based monitoring com time-series database</p>
                
                <div className="metrics-info">
                  <div className="info-item">
                    <span className="label">Latência:</span>
                    <span className="value">{apmStatus.prometheus.latency}ms</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Tipo:</span>
                    <span className="value">Metrics</span>
                  </div>
                </div>

                <div className="features">
                  <h4>Funcionalidades:</h4>
                  <ul>
                    <li>✅ Coleta de métricas automática</li>
                    <li>✅ Alertas customizáveis</li>
                    <li>✅ Dashboards poderosos (Grafana)</li>
                    <li>✅ PromQL para queries avançadas</li>
                  </ul>
                </div>

                <div className="quick-links">
                  <a href="http://localhost:9090" target="_blank" rel="noopener noreferrer" className="btn-link prometheus-btn">
                    Prometheus UI
                  </a>
                  <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" className="btn-link grafana-btn">
                    Grafana Dashboard
                  </a>
                </div>

                <div className="score">
                  <strong>Score Acadêmico:</strong> <span className="score-value">⭐⭐⭐⭐⭐</span>
                </div>
              </div>
            </div>

            {/* Card Elastic */}
            <div className="apm-card elastic">
              <div className="card-header">
                <h2>🔍 Elastic Stack (ELK)</h2>
                <span className="status-indicator" style={{ backgroundColor: getStatusColor(apmStatus.elastic.status) }}>
                  {getStatusLabel(apmStatus.elastic.status)}
                </span>
              </div>
              <div className="card-body">
                <p className="description">Logs + Métricas + Traces centralizados</p>
                
                <div className="metrics-info">
                  <div className="info-item">
                    <span className="label">Latência:</span>
                    <span className="value">{apmStatus.elastic.latency}ms</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Tipo:</span>
                    <span className="value">Full Stack</span>
                  </div>
                </div>

                <div className="features">
                  <h4>Funcionalidades:</h4>
                  <ul>
                    <li>✅ Logs centralizados</li>
                    <li>✅ Análise full-text</li>
                    <li>✅ Traces distribuídas</li>
                    <li>✅ Machine Learning integrado</li>
                  </ul>
                </div>

                <div className="quick-links">
                  <a href="http://localhost:9200" target="_blank" rel="noopener noreferrer" className="btn-link elastic-btn">
                    Elasticsearch
                  </a>
                  <a href="http://localhost:5601" target="_blank" rel="noopener noreferrer" className="btn-link kibana-btn">
                    Kibana Dashboard
                  </a>
                </div>

                <div className="score">
                  <strong>Score Acadêmico:</strong> <span className="score-value">⭐⭐⭐⭐⭐</span>
                </div>
              </div>
            </div>

            {/* Card Sentry */}
            <div className="apm-card sentry">
              <div className="card-header">
                <h2>🐛 Sentry</h2>
                <span className="status-indicator" style={{ backgroundColor: getStatusColor(apmStatus.sentry.status) }}>
                  {getStatusLabel(apmStatus.sentry.status)}
                </span>
              </div>
              <div className="card-body">
                <p className="description">Error tracking + Performance monitoring</p>
                
                <div className="metrics-info">
                  <div className="info-item">
                    <span className="label">Latência:</span>
                    <span className="value">{apmStatus.sentry.latency}ms</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Tipo:</span>
                    <span className="value">Error + APM</span>
                  </div>
                </div>

                <div className="features">
                  <h4>Funcionalidades:</h4>
                  <ul>
                    <li>✅ Captura de erros automática</li>
                    <li>✅ Performance monitoring</li>
                    <li>✅ Release tracking</li>
                    <li>✅ Alertas e notificações</li>
                  </ul>
                </div>

                <div className="quick-links">
                  <a href="https://sentry.io/" target="_blank" rel="noopener noreferrer" className="btn-link sentry-btn">
                    Sentry Dashboard
                  </a>
                  <a href="http://localhost:3001/api/sentry/status" target="_blank" rel="noopener noreferrer" className="btn-link status-btn">
                    Status API
                  </a>
                </div>

                <div className="score">
                  <strong>Score Acadêmico:</strong> <span className="score-value">⭐⭐⭐⭐</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Análise Detalhada */}
      {selectedTab === 'detailed' && (
        <div className="apm-detailed">
          <div className="comparison-table-wrapper">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Aspecto</th>
                  <th>Prometheus</th>
                  <th>Elastic Stack</th>
                  <th>Sentry</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Setup</strong></td>
                  <td>Médio (Docker Compose)</td>
                  <td>Complexo (3 componentes)</td>
                  <td>Fácil (SaaS)</td>
                </tr>
                <tr>
                  <td><strong>Custo</strong></td>
                  <td>Gratuito (Self-hosted)</td>
                  <td>Gratuito (Self-hosted)</td>
                  <td>Freemium (SaaS)</td>
                </tr>
                <tr>
                  <td><strong>Métricas</strong></td>
                  <td>⭐⭐⭐⭐⭐</td>
                  <td>⭐⭐⭐⭐</td>
                  <td>⭐⭐⭐</td>
                </tr>
                <tr>
                  <td><strong>Logs</strong></td>
                  <td>⭐⭐</td>
                  <td>⭐⭐⭐⭐⭐</td>
                  <td>⭐⭐</td>
                </tr>
                <tr>
                  <td><strong>Traces</strong></td>
                  <td>⭐⭐</td>
                  <td>⭐⭐⭐⭐</td>
                  <td>⭐⭐⭐</td>
                </tr>
                <tr>
                  <td><strong>Dashboards</strong></td>
                  <td>⭐⭐⭐⭐ (Grafana)</td>
                  <td>⭐⭐⭐⭐ (Kibana)</td>
                  <td>⭐⭐⭐</td>
                </tr>
                <tr>
                  <td><strong>Alertas</strong></td>
                  <td>⭐⭐⭐⭐</td>
                  <td>⭐⭐⭐⭐</td>
                  <td>⭐⭐⭐</td>
                </tr>
                <tr>
                  <td><strong>Realismo</strong></td>
                  <td>⭐⭐⭐⭐⭐ (Industria)</td>
                  <td>⭐⭐⭐⭐⭐ (Empresas)</td>
                  <td>⭐⭐⭐⭐ (Startups)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="analysis-text">
            <h3>Recomendação para Projeto Acadêmico</h3>
            <p>
              Para um projeto que compara 3 APMs, recomendamos:
            </p>
            <ol>
              <li><strong>Prometheus:</strong> Implementar primeiro (melhor custo-benefício)</li>
              <li><strong>Elastic:</strong> Mostrar alternativa mais completa</li>
              <li><strong>Sentry:</strong> Completar com foco em erros/performance</li>
            </ol>
          </div>
        </div>
      )}

      {/* TAB 3: Endpoints */}
      {selectedTab === 'endpoints' && (
        <div className="apm-endpoints">
          <div className="endpoints-list">
            <h3>APIs Disponíveis</h3>
            
            <div className="endpoint-item">
              <code className="endpoint-path">GET /api/apms/comparison</code>
              <p>Retorna dados de comparação entre os 3 APMs</p>
              <a href="http://localhost:3001/api/apms/comparison" target="_blank" rel="noopener noreferrer" className="btn-link">
                Testar endpoint
              </a>
            </div>

            <div className="endpoint-item">
              <code className="endpoint-path">GET /api/status</code>
              <p>Status geral do sistema e APMs habilitadas</p>
              <a href="http://localhost:3001/api/status" target="_blank" rel="noopener noreferrer" className="btn-link">
                Testar endpoint
              </a>
            </div>

            <div className="endpoint-item">
              <code className="endpoint-path">GET /api/prometheus</code>
              <p>Dados Prometheus em formato JSON</p>
              <a href="http://localhost:3001/api/prometheus" target="_blank" rel="noopener noreferrer" className="btn-link">
                Testar endpoint
              </a>
            </div>

            <div className="endpoint-item">
              <code className="endpoint-path">GET /api/elastic/summary</code>
              <p>Resumo de métricas do Elastic</p>
              <a href="http://localhost:3001/api/elastic/summary" target="_blank" rel="noopener noreferrer" className="btn-link">
                Testar endpoint
              </a>
            </div>

            <div className="endpoint-item">
              <code className="endpoint-path">GET /api/sentry/status</code>
              <p>Status da integração Sentry</p>
              <a href="http://localhost:3001/api/sentry/status" target="_blank" rel="noopener noreferrer" className="btn-link">
                Testar endpoint
              </a>
            </div>

            <div className="endpoint-item">
              <code className="endpoint-path">GET /metrics</code>
              <p>Métricas em formato Prometheus (text/plain)</p>
              <a href="http://localhost:3001/metrics" target="_blank" rel="noopener noreferrer" className="btn-link">
                Testar endpoint
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default APMComparison;
