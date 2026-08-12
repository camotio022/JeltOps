import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from './firebaseConfig';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import './App.css';

function App() {
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('ALL'); // Novo: Filtro por alvo
  
  const [stats, setStats] = useState({
    uptime: '100%',
    avgLatency: '0ms',
    totalChecks: 0,
    status: 'Operational',
    alerts: 0
  });

  useEffect(() => {
    const q = query(collection(db, "metrics_logs"), orderBy("timestamp", "desc"), limit(40));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const realTimeLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        const dateObj = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
        return {
          id: doc.id,
          ...data,
          timestamp: dateObj,
          timeFormatted: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
      });
      
      setLogs(realTimeLogs);

      // Filtra os logs para o gráfico de acordo com a aba selecionada
      const filteredForChart = realTimeLogs.filter(log => 
        selectedTarget === 'ALL' || log.target === selectedTarget
      );

      const formattedForChart = [...filteredForChart].reverse().map(log => ({
        time: log.timeFormatted,
        latency: log.latencyMs,
        target: log.target
      }));
      setChartData(formattedForChart);

      // Métricas gerais baseadas no filtro ativo
      const targetLogs = realTimeLogs.filter(log => 
        selectedTarget === 'ALL' || log.target === selectedTarget
      );

      if (targetLogs.length > 0) {
        const total = targetLogs.length;
        const downs = targetLogs.filter(l => l.status === 'DOWN').length;
        const uptimeCalc = (((total - downs) / total) * 100).toFixed(1) + '%';
        
        const totalLat = targetLogs.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0);
        const avgLat = Math.round(totalLat / total) + 'ms';

        setStats({
          uptime: uptimeCalc,
          avgLatency: avgLat,
          totalChecks: total,
          status: downs === 0 ? 'Operational' : 'Degraded',
          alerts: downs
        });
      }
    });

    return () => unsubscribe();
  }, [selectedTarget]);

  // Lista de alvos disponíveis para os botões de filtro
  const targetsList = ['ALL', 'YouTube Main API', 'Google Endpoint'];

  return (
    <div className="dashboard-container">
      {stats.alerts > 0 && (
        <div className="alert-banner" style={{background: '#7f1d1d', color: '#fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center'}}>
          ⚠️ <strong>Alerta de Infraestrutura:</strong> {stats.alerts} falha(s) detectada(s) no alvo selecionado!
        </div>
      )}

      <header className="dashboard-header">
        <div className="logo-area">
          <h1>Jelt<span className="badge">Ops</span></h1>
          <p>Real-time Infrastructure Observability & Latency Monitoring</p>
        </div>
        
        <div className="header-controls">
          <div className={`global-status ${stats.alerts === 0 ? 'ok' : 'degraded'}`}>
            <span className="pulse-dot"></span>
            {stats.status === 'Operational' ? 'Sistema Operacional' : 'Performance Degrada'}
          </div>
        </div>
      </header>

      {/* Barra de Filtros por Alvo */}
      <div className="filter-bar" style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
        <span style={{alignSelf: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: 'bold'}}>Filtrar Alvo:</span>
        {targetsList.map(target => (
          <button
            key={target}
            onClick={() => setSelectedTarget(target)}
            style={{
              background: selectedTarget === target ? '#38bdf8' : '#1e293b',
              color: selectedTarget === target ? '#0f172a' : '#f8fafc',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              transition: '0.2s'
            }}
          >
            {target === 'ALL' ? '🌐 Visão Geral' : target}
          </button>
        ))}
      </div>
      
      {/* Métricas Principais */}
      <section className="metrics-grid">
        <div className="metric-card">
          <h3>Uptime Global</h3>
          <p className="metric-value">{stats.uptime}</p>
          <span className="metric-desc">Disponibilidade do alvo</span>
        </div>
        <div className="metric-card">
          <h3>Latência Média</h3>
          <p className="metric-value">{stats.avgLatency}</p>
          <span className="metric-desc">Tempo de resposta</span>
        </div>
        <div className="metric-card">
          <h3>Verificações Analisadas</h3>
          <p className="metric-value">{stats.totalChecks}</p>
          <span className="metric-desc">Logs processados</span>
        </div>
      </section>

      {/* Gráfico Dinâmico */}
      <section className="chart-section">
        <h2>Variação de Latência ({selectedTarget === 'ALL' ? 'Todos os Alvos' : selectedTarget})</h2>
        <div className="chart-wrapper">
          {chartData.length === 0 ? (
            <div className="empty-chart">Carregando métricas do gráfico...</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} unit="ms" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#121824', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                  itemStyle={{ color: '#38bdf8' }}
                />
                <Line type="monotone" dataKey="latency" name="Latência (ms)" stroke="#38bdf8" strokeWidth={3} dot={{ fill: '#38bdf8', r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Tabela de Histórico */}
      <section className="logs-section">
        <h2>Histórico de Execuções e Logs</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Alvo</th>
                <th>URL</th>
                <th>Latência</th>
                <th>Horário</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-row">Aguardando dados do monitor de backend...</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className={`status-badge ${log.status ? log.status.toLowerCase() : 'down'}`}>
                        {log.status || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="target-name">{log.target}</td>
                    <td className="url-text">{log.url}</td>
                    <td><strong>{log.latencyMs} ms</strong></td>
                    <td>{log.timestamp instanceof Date ? log.timestamp.toLocaleTimeString() : 'Agora'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

App;

export default App;