import { useEffect, useState } from 'react';
import '../styles/APMComparison.css';

function APMComparison() {
  const [apmStatus, setApmStatus] = useState({
    prometheus: { enabled: false, latency: 0, status: 'checking' },
    elastic: { enabled: false, latency: 0, status: 'checking' },
    sentry: { enabled: false, latency: 0, status: 'checking' }
  });

  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    const testAPMLatencies = async () => {
      const newStatus = { ...apmStatus };

      // 1. Prometheus
      try {
        const start = performance.now();
        const resp = await fetch('http://localhost:3001/metrics', { signal: AbortSignal.timeout(5000) });
        const latency = performance.now() - start;
        newStatus.prometheus = { enabled: resp.ok, latency: Math.round(latency), status: resp.ok ? 'online' : 'offline' };
      } catch (e) { newStatus.prometheus = { enabled: false, latency: 0, status: 'offline' }; }

      // 2. Elastic (usa o fallback no server.js)
      try {
        const start = performance.now();
        const resp = await fetch('http://localhost:3001/api/elastic/summary', { signal: AbortSignal.timeout(5000) });
        const latency = performance.now() - start;
        newStatus.elastic = { enabled: resp.ok, latency: Math.round(latency), status: resp.ok ? 'online' : 'offline' };
      } catch (e) { newStatus.elastic = { enabled: false, latency: 0, status: 'offline' }; }

      // 3. Sentry
      try {
        const start = performance.now();
        const resp = await fetch('http://localhost:3001/api/sentry/status', { signal: AbortSignal.timeout(5000) });
        const latency = performance.now() - start;
        const data = await resp.json();
        newStatus.sentry = { enabled: data.enabled, latency: Math.round(latency), status: data.enabled ? 'online' : 'offline' };
      } catch (e) { newStatus.sentry = { enabled: false, latency: 0, status: 'offline' }; }

      setApmStatus(newStatus);
    };

    testAPMLatencies();
    const interval = setInterval(testAPMLatencies, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (s) => s === 'online' ? '#10b981' : s === 'offline' ? '#ef4444' : '#f59e0b';
  const getStatusLabel = (s) => s === 'online' ? '🟢 Online' : s === 'offline' ? '🔴 Offline' : '🟡 Checking';

  return (
    <div className="apm-comparison-panel">
      <div className="apm-header">
        <h1>🔍 Comparação de APMs</h1>
        <p>Análise comparativa de 3 soluções de monitoring para JeltOps</p>
      </div>

      <div className="apm-tabs">
        <button className={`tab-btn ${selectedTab === 'overview' ? 'active' : ''}`} onClick={() => setSelectedTab('overview')}>Overview</button>
        <button className={`tab-btn ${selectedTab === 'detailed' ? 'active' : ''}`} onClick={() => setSelectedTab('detailed')}>Análise Detalhada</button>
        <button className={`tab-btn ${selectedTab === 'endpoints' ? 'active' : ''}`} onClick={() => setSelectedTab('endpoints')}>Endpoints</button>
      </div>

      {selectedTab === 'overview' && (
        <div className="apm-overview">
          <div className="apm-grid">
            {/* Cards simplificados para Prometheus, Elastic e Sentry */}
            {Object.keys(apmStatus).map(key => (
              <div key={key} className={`apm-card ${key}`}>
                <div className="card-header">
                  <h2>{key.toUpperCase()}</h2>
                  <span className="status-indicator" style={{ backgroundColor: getStatusColor(apmStatus[key].status) }}>
                    {getStatusLabel(apmStatus[key].status)}
                  </span>
                </div>
                <div className="card-body">
                  <p>Latência: {apmStatus[key].latency}ms</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTab === 'detailed' && (
        <div className="apm-detailed">
          <table className="comparison-table">
            <thead><tr><th>Aspecto</th><th>Prometheus</th><th>Elastic</th><th>Sentry</th></tr></thead>
            <tbody>
              <tr><td>Setup</td><td>Médio</td><td>Complexo</td><td>Fácil</td></tr>
              <tr><td>Custo</td><td>Grátis</td><td>Grátis</td><td>Freemium</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {selectedTab === 'endpoints' && (
        <div className="apm-endpoints">
          <h3>APIs Disponíveis (Localhost:3001)</h3>
          <div className="endpoint-item"><code>GET /api/status</code> - Status geral</div>
          <div className="endpoint-item"><code>GET /metrics</code> - Métricas Prometheus</div>
          <div className="endpoint-item"><code>GET /api/elastic/summary</code> - Dados Elastic</div>
        </div>
      )}
    </div>
  );
}

export default APMComparison;