import { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from './firebaseConfig';
import { runUptimeCheck } from './services/monitorAgent';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import './App.css';

function App() {
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const intervalRef = useRef(null);
  
  const [stats, setStats] = useState({
    uptime: '100%',
    avgLatency: '0ms',
    totalChecks: 0,
    status: 'Operational'
  });

  const triggerChecks = async () => {
    const targets = [
      { name: "YouTube Main API", url: "https://www.youtube.com" },
      { name: "Google Endpoint", url: "https://www.google.com" }
    ];
    for (const target of targets) {
      await runUptimeCheck(target.name, target.url);
    }
  };

  useEffect(() => {
    if (isMonitoring) {
      triggerChecks();
      intervalRef.current = setInterval(triggerChecks, 60000); // A cada 1 minuto
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isMonitoring]);

  useEffect(() => {
    const q = query(collection(db, "metrics_logs"), orderBy("timestamp", "desc"), limit(20));
    
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

      const formattedForChart = [...realTimeLogs].reverse().map(log => ({
        time: log.timeFormatted,
        latency: log.latencyMs,
        target: log.target
      }));
      setChartData(formattedForChart);

      if (realTimeLogs.length > 0) {
        const total = realTimeLogs.length;
        const downs = realTimeLogs.filter(l => l.status === 'DOWN').length;
        const uptimeCalc = (((total - downs) / total) * 100).toFixed(1) + '%';
        
        const totalLat = realTimeLogs.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0);
        const avgLat = Math.round(totalLat / total) + 'ms';

        setStats({
          uptime: uptimeCalc,
          avgLatency: avgLat,
          totalChecks: total,
          status: downs === 0 ? 'Operational' : 'Degraded'
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="logo-area">
          <h1>Jelt <span className="badge">Ops</span></h1>
          <p>Real-time Infrastructure Observability & Latency Monitoring</p>
        </div>
        
        <div className="header-controls">
          <button 
            className={`control-btn ${isMonitoring ? 'stop' : 'start'}`}
            onClick={() => setIsMonitoring(!isMonitoring)}
          >
            {isMonitoring ? '⏹ Parar Agente' : '▶ Iniciar Agente'}
          </button>

          <div className={`global-status ${isMonitoring ? 'ok' : 'stopped'}`}>
            <span className="pulse-dot"></span>
            {isMonitoring ? 'Monitoramento Ativo' : 'Monitoramento Pausado'}
          </div>
        </div>
      </header>
      
      <section className="metrics-grid">
        <div className="metric-card">
          <h3>Uptime Global</h3>
          <p className="metric-value">{stats.uptime}</p>
          <span className="metric-desc">Disponibilidade histórica</span>
        </div>
        <div className="metric-card">
          <h3>Latência Média</h3>
          <p className="metric-value">{stats.avgLatency}</p>
          <span className="metric-desc">Tempo de resposta atual</span>
        </div>
        <div className="metric-card">
          <h3>Total de Verificações</h3>
          <p className="metric-value">{stats.totalChecks}</p>
          <span className="metric-desc">Sincronizado via Firestore Live</span>
        </div>
      </section>

      <section className="chart-section">
        <h2>Variação de Latência ao Longo do Tempo (ms)</h2>
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
                <Line type="monotone" dataKey="latency" name="Latência" stroke="#38bdf8" strokeWidth={3} dot={{ fill: '#38bdf8', r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

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
                  <td colSpan="5" className="empty-row">Aguardando dados do agente...</td>
                </tr>
              ) : (
                logs.map((log, index) => (
                  <tr key={index}>
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

export default App;