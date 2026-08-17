import { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from './firebaseConfig';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import APMComparison from './components/APMComparison';
import './App.css';

const formatMs = (value, digits = 0) => {
  const safeValue = Number(value ?? 0);
  if (!Number.isFinite(safeValue)) return '0ms';
  return `${safeValue.toFixed(digits)}ms`;
};

const formatPercent = (value) => `${Number(value ?? 0).toFixed(1)}%`;

function App() {
  const [theme, setTheme] = useState('dark');
  const [logs, setLogs] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('ALL');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 7;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const q = query(collection(db, 'metrics_logs'), orderBy('timestamp', 'desc'), limit(120));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transformed = snapshot.docs.map((doc) => {
        const data = doc.data();
        const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();

        return {
          id: doc.id,
          ...data,
          timestamp,
          timeFormatted: timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        };
      });

      setLogs(transformed);
      setCurrentPage(1);
    });

    return () => unsubscribe();
  }, []);

  const targetOptions = useMemo(
    () => ['ALL', ...Array.from(new Set(logs.map((log) => log.target).filter(Boolean)))],
    [logs]
  );

  const filteredLogs = useMemo(
    () => (selectedTarget === 'ALL' ? logs : logs.filter((log) => log.target === selectedTarget)),
    [logs, selectedTarget]
  );

  const currentLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));

  const summary = useMemo(() => {
    if (!filteredLogs.length) {
      return {
        uptime: '0.0%',
        avgLatency: '0ms',
        avgDns: '0ms',
        avgTcp: '0ms',
        totalChecks: 0,
        alerts: 0,
        status: 'Operational',
        avgMemory: '0MB',
        avgCpu: '0%'
      };
    }

    const total = filteredLogs.length;
    const downCount = filteredLogs.filter((log) => log.status === 'DOWN').length;
    const totalLatency = filteredLogs.reduce((sum, log) => sum + Number(log.latencyMs || 0), 0);
    const totalDns = filteredLogs.reduce((sum, log) => sum + Number(log.dnsLookupMs || 0), 0);
    const totalTcp = filteredLogs.reduce((sum, log) => sum + Number(log.tcpConnectMs || 0), 0);
    const totalMemory = filteredLogs.reduce((sum, log) => sum + Number(log.runtime?.memoryRssMb || 0), 0);
    const totalCpu = filteredLogs.reduce((sum, log) => sum + Number(log.runtime?.cpuUserMs || 0), 0);

    return {
      uptime: formatPercent(((total - downCount) / total) * 100),
      avgLatency: formatMs(totalLatency / total),
      avgDns: formatMs(totalDns / total),
      avgTcp: formatMs(totalTcp / total),
      totalChecks: total,
      alerts: downCount,
      status: downCount === 0 ? 'Operational' : 'Degraded',
      avgMemory: `${(totalMemory / total).toFixed(1)}MB`,
      avgCpu: `${((totalCpu / total) / 10).toFixed(1)}%`
    };
  }, [filteredLogs]);

  const chartData = useMemo(
    () =>
      filteredLogs
        .slice()
        .reverse()
        .slice(-24)
        .map((log) => ({
          time: log.timeFormatted,
          latency: Number(log.latencyMs || 0),
          dns: Number(log.dnsLookupMs || 0),
          tcp: Number(log.tcpConnectMs || 0),
          statusCode: Number(log.statusCode || 0),
          target: log.target,
          status: log.status
        })),
    [filteredLogs]
  );

  const latestCheck = filteredLogs[0] ?? null;

  return (
    <div className="app-shell">
      <aside className="sidebar-panel">
        <div className="brand-block">
          <div>
            <div className="eyebrow">NOC / SRE</div>
            <h1>
              Jelt<span>Ops</span>
            </h1>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>

        <div className="sidebar-metrics">
          <div className="dashboard-tile compact">
            <span>Uptime</span>
            <strong>{summary.uptime}</strong>
          </div>
          <div className="dashboard-tile compact">
            <span>Latency</span>
            <strong>{summary.avgLatency}</strong>
          </div>
          <div className="dashboard-tile compact">
            <span>Checks</span>
            <strong>{summary.totalChecks}</strong>
          </div>
        </div>

        <div className="status-panel">
          <div className={`status-pill ${summary.alerts === 0 ? 'ok' : 'degraded'}`}>
            <span className="pulse-dot" />
            {summary.status === 'Operational' ? 'Operational' : 'Degraded'}
          </div>
          <p className="panel-hint">Executed checks from cron jobs and external endpoints.</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">Real-time infrastructure observability</div>
            <h2>Global health overview</h2>
          </div>

          <div className="tabs">
            <button
              type="button"
              className={activeTab === 'dashboard' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('dashboard')}
            >
              📊 Dashboard
            </button>
            <button
              type="button"
              className={activeTab === 'apms' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('apms')}
            >
              🔍 APMs
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' ? (
          <>
            {summary.alerts > 0 && (
              <div className="alert-banner">
                ⚠️ {summary.alerts} failed checks detected in the selected scope.
              </div>
            )}

            <div className="filter-bar">
              <span className="filter-label">Targets</span>
              {targetOptions.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setSelectedTarget(target)}
                  className={selectedTarget === target ? 'filter-button active' : 'filter-button'}
                >
                  {target === 'ALL' ? 'Worldwide' : target}
                </button>
              ))}
            </div>

            <section className="overview-grid">
              <div className="dashboard-tile">
                <span>Average latency</span>
                <strong>{summary.avgLatency}</strong>
                <small>Complete response time</small>
              </div>
              <div className="dashboard-tile">
                <span>DNS lookup</span>
                <strong>{summary.avgDns}</strong>
                <small>Resolution time</small>
              </div>
              <div className="dashboard-tile">
                <span>TCP connect</span>
                <strong>{summary.avgTcp}</strong>
                <small>Socket establishment</small>
              </div>
              <div className="dashboard-tile">
                <span>Runtime memory</span>
                <strong>{summary.avgMemory}</strong>
                <small>Process RSS</small>
              </div>
            </section>

            <section className="charts-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>Latency trend</h3>
                  <span>{selectedTarget === 'ALL' ? 'All targets' : selectedTarget}</span>
                </div>

                <div className="chart-box">
                  {chartData.length === 0 ? (
                    <div className="empty-state">Waiting for metrics…</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" />
                        <XAxis dataKey="time" stroke="var(--muted-text)" fontSize={11} />
                        <YAxis stroke="var(--muted-text)" fontSize={11} unit="ms" />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            color: 'var(--text-color)'
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="latency"
                          stroke="var(--blue-500)"
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 5 }}
                          name="Latency"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>DNS and TCP</h3>
                  <span>Network timing</span>
                </div>

                <div className="chart-box">
                  {chartData.length === 0 ? (
                    <div className="empty-state">Waiting for metrics…</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 10 }}>
                        <defs>
                          <linearGradient id="dnsGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor="var(--amber-400)" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="var(--amber-400)" stopOpacity={0.2} />
                          </linearGradient>
                          <linearGradient id="tcpGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor="var(--violet-400)" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="var(--violet-400)" stopOpacity={0.2} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" />
                        <XAxis dataKey="time" stroke="var(--muted-text)" fontSize={11} />
                        <YAxis stroke="var(--muted-text)" fontSize={11} unit="ms" />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            color: 'var(--text-color)'
                          }}
                        />
                        <Area type="monotone" dataKey="dns" stroke="var(--amber-400)" fill="url(#dnsGradient)" strokeWidth={2} name="DNS" />
                        <Area type="monotone" dataKey="tcp" stroke="var(--violet-400)" fill="url(#tcpGradient)" strokeWidth={2} name="TCP" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </section>

            <section className="detail-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>Latest execution metadata</h3>
                  <span>{latestCheck?.target || 'No data'}</span>
                </div>

                <div className="info-stack">
                  <div className="info-row">
                    <span>Request IP</span>
                    <strong>{latestCheck?.requestIp || 'unknown'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Server region</span>
                    <strong>{latestCheck?.serverRegion || latestCheck?.serverLocation?.region || 'unknown'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Server location</span>
                    <strong>
                      {latestCheck?.serverLocation
                        ? `${latestCheck.serverLocation.city}, ${latestCheck.serverLocation.country}`
                        : 'unknown'}
                    </strong>
                  </div>
                  <div className="info-row">
                    <span>Runtime memory</span>
                    <strong>{latestCheck?.runtime?.memoryRssMb ? `${latestCheck.runtime.memoryRssMb}MB` : 'unknown'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Runtime CPU</span>
                    <strong>{latestCheck?.runtime?.cpuUserMs ? `${latestCheck.runtime.cpuUserMs}ms` : 'unknown'}</strong>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Network and runtime</h3>
                  <span>Current check</span>
                </div>

                <div className="mini-stats">
                  <div>
                    <label>HTTP status</label>
                    <strong>{latestCheck?.statusCode ?? 0}</strong>
                  </div>
                  <div>
                    <label>DNS</label>
                    <strong>{formatMs(latestCheck?.dnsLookupMs)}</strong>
                  </div>
                  <div>
                    <label>TCP</label>
                    <strong>{formatMs(latestCheck?.tcpConnectMs)}</strong>
                  </div>
                  <div>
                    <label>Heap</label>
                    <strong>{latestCheck?.runtime?.heapUsedMb ? `${latestCheck.runtime.heapUsedMb}MB` : 'unknown'}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel table-panel">
              <div className="panel-header">
                <h3>Recent checks</h3>
                <span>{filteredLogs.length} records</span>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Target</th>
                      <th>Latency</th>
                      <th>DNS</th>
                      <th>TCP</th>
                      <th>HTTP</th>
                      <th>IP</th>
                      <th>Region</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLogs.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="empty-row">
                          Awaiting data...
                        </td>
                      </tr>
                    ) : (
                      currentLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <span className={`status-pill-table ${log.status === 'UP' ? 'up' : 'down'}`}>
                              {log.status || 'UNKNOWN'}
                            </span>
                          </td>
                          <td>{log.target}</td>
                          <td>{formatMs(log.latencyMs)}</td>
                          <td>{formatMs(log.dnsLookupMs)}</td>
                          <td>{formatMs(log.tcpConnectMs)}</td>
                          <td>{log.statusCode ?? 0}</td>
                          <td>{log.requestIp || 'unknown'}</td>
                          <td>{log.serverRegion || 'unknown'}</td>
                          <td>{log.timeFormatted}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {filteredLogs.length > itemsPerPage && (
                <div className="pagination">
                  <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                    Previous
                  </button>
                  <span>
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
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
