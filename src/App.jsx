import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from './firebaseConfig';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import APMComparison from './components/APMComparison';
import './App.css';

function App() {
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('ALL');
  const [activeTab, setActiveTab] = useState('firestore'); // 'firestore' ou 'apms'
  
  // Estados para controlar a paginação dos logs
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Quantidade otimizada para encaixar na tela única

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLogs = logs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(logs.length / itemsPerPage) || 1;

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

      const filteredForChart = realTimeLogs.filter(log => 
        selectedTarget === 'ALL' || log.target === selectedTarget
      );

      const formattedForChart = [...filteredForChart].reverse().map(log => ({
        time: log.timeFormatted,
        latency: log.latencyMs,
        target: log.target
      }));
      setChartData(formattedForChart);

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

  const targetsList = ['ALL', 'YouTube Main API', 'Google Endpoint'];

  return (
    <div className="dashboard-layout-noc">
      
      {/* COLUNA ESQUERDA: Sidebar de Métricas (15%) */}
      <aside className="noc-sidebar">
        <div className="sidebar-brand">
          <h2>Jelt<span className="badge">Ops</span></h2>
        </div>
        
        <div className="sidebar-metrics">
          <div className="metric-card-vertical">
            <h3>Uptime Global</h3>
            <p className="metric-value-small">{stats.uptime}</p>
          </div>
          <div className="metric-card-vertical">
            <h3>Latência Média</h3>
            <p className="metric-value-small">{stats.avgLatency}</p>
          </div>
          <div className="metric-card-vertical">
            <h3>Verificações</h3>
            <p className="metric-value-small">{stats.totalChecks}</p>
          </div>
        </div>
      </aside>

      {/* COLUNA DIREITA: Conteúdo Principal (85%) */}
      <main className="noc-main">
        
        {/* Barra Superior / Navbar */}
        <header className="noc-header">
          <div className="header-info">
            <p>Real-time Infrastructure Observability</p>
            {/* Tabs para alternar entre Firestore e APMs */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => setActiveTab('firestore')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: activeTab === 'firestore' ? '#38bdf8' : '#1e293b',
                  color: activeTab === 'firestore' ? '#000' : '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: activeTab === 'firestore' ? 'bold' : 'normal'
                }}
              >
                📊 Firestore Dashboard
              </button>
              <button
                onClick={() => setActiveTab('apms')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: activeTab === 'apms' ? '#38bdf8' : '#1e293b',
                  color: activeTab === 'apms' ? '#000' : '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: activeTab === 'apms' ? 'bold' : 'normal'
                }}
              >
                🔍 APMs Comparison
              </button>
            </div>
          </div>
          <div className={`global-status ${stats.alerts === 0 ? 'ok' : 'degraded'}`}>
            <span className="pulse-dot"></span>
            {stats.status === 'Operational' ? 'Sistema Operacional' : 'Performance Degrada'}
          </div>
        </header>

        {/* Mostrar conteúdo baseado na aba ativa */}
        {activeTab === 'firestore' ? (
          <>
            {stats.alerts > 0 && (
              <div className="alert-banner-compact">
                ⚠️ <strong>Alerta:</strong> {stats.alerts} falha(s) detectada(s)!
              </div>
            )}

            {/* Barra de Filtros */}
            <div className="filter-bar">
              <span className="filter-label">Alvo:</span>
              {targetsList.map(target => (
                <button
                  key={target}
                  onClick={() => setSelectedTarget(target)}
                  className={`filter-btn ${selectedTarget === target ? 'active' : ''}`}
                >
                  {target === 'ALL' ? '🌐 Geral' : target}
                </button>
              ))}
            </div>

            {/* Seção Superior: Gráfico Dinâmico */}
            <section className="chart-section-noc">
          <h2>Variação de Latência ({selectedTarget === 'ALL' ? 'Todos' : selectedTarget})</h2>
          <div className="chart-wrapper-noc">
            {chartData.length === 0 ? (
              <div className="empty-chart">Carregando métricas...</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} unit="ms" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121824', borderColor: '#334155', borderRadius: '6px', color: '#f8fafc', fontSize: '11px' }}
                    itemStyle={{ color: '#38bdf8' }}
                  />
                  <Line type="monotone" dataKey="latency" name="Latência" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

            {/* Seção Inferior: Tabela de Logs com Paginação */}
            <section className="logs-section-noc">
              <h2>Histórico de Logs</h2>
              <div className="table-wrapper-noc">
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
                {currentLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-row">Aguardando dados...</td>
                  </tr>
                ) : (
                  currentLogs.map((log) => (
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

          {/* Paginação Compacta */}
          {logs.length > itemsPerPage && (
            <div className="pagination-noc">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="page-btn"
              >
                ← Anterior
              </button>
              <span className="page-info">Pág. <strong>{currentPage}</strong> / {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="page-btn"
              >
                Próxima →
              </button>
              </div>
            )}  
            </section>
          </>
        ) : (
          <APMComparison />
        )}

      </main>
    </div>
  );
}

export default App;