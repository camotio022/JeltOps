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
import Laboratory from './components/Laboratory';
import MySites from './components/MySites';
import './App.css';
import './MissionControl.css';

const formatMs = (value, digits = 0) => {
  const safeValue = Number(value ?? 0);
  if (!Number.isFinite(safeValue)) return '0ms';
  return `${safeValue.toFixed(digits)}ms`;
};

const formatPercent = (value) => `${Number(value ?? 0).toFixed(1)}%`;

function App() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('jeltops-theme') || 'dark');
  const [dataError, setDataError] = useState('');
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [screen, setScreen] = useState('monitor');

  const itemsPerPage = 7;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#090d13' : '#f3f5ef');
    window.localStorage.setItem('jeltops-theme', theme);
  }, [theme]);

  useEffect(() => {
    const q = query(collection(db, 'metrics_logs'), orderBy('timestamp', 'desc'), limit(120));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transformed = snapshot.docs.filter((doc) => doc.data().target !== 'JeltOps Laboratory').map((doc) => {
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
      setLoading(false);
      setDataError('');
    }, (error) => {
      setLoading(false);
      setDataError(`Falha ao carregar registros: ${error.message}`);
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
        successRate: '0.0%',
        avgLatency: '0ms',
        avgDns: '0ms',
        avgTcp: '0ms',
        savedRecords: 0,
        failedRecords: 0,
        status: 'Sem dados',
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
      successRate: formatPercent(((total - downCount) / total) * 100),
      avgLatency: formatMs(totalLatency / total),
      avgDns: formatMs(totalDns / total),
      avgTcp: formatMs(totalTcp / total),
      savedRecords: total,
      failedRecords: downCount,
      status: downCount === 0 ? 'Operacional' : 'Instável',
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
  const targetsLatest = useMemo(() => {
    const map = new Map();
    for (const item of logs) if (item.target && !map.has(item.target)) map.set(item.target, item);
    return [...map.values()];
  }, [logs]);
  const activeFailures = targetsLatest.filter((item) => item.status === 'DOWN');
  const lastCheckAgeMs = logs[0]?.timestamp instanceof Date ? Date.now() - logs[0].timestamp.getTime() : Infinity;
  const dataStale = lastCheckAgeMs > 30 * 60 * 1000;
  const currentHealth = loading ? 'Verificando' : dataError ? 'Indisponível' : !logs.length ? 'Sem dados' : dataStale ? 'Dados antigos' : activeFailures.length ? 'Atenção' : 'Operacional';
  const currentHealthClass = activeFailures.length || dataError ? 'degraded' : !logs.length || dataStale ? 'neutral' : 'ok';
  const latestTimestamp = logs[0]?.timestamp instanceof Date ? logs[0].timestamp.toLocaleString('pt-BR') : 'Aguardando';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside className="sidebar-panel">
        <div className="brand-block">
          <div className="command-brand"><span className="command-brand-mark" aria-hidden="true">⌁</span><div><h1>Jelt<span>Ops</span></h1><span className="brand-caption">CENTRAL DE COMANDO</span></div></div>
          <button type="button" className="theme-toggle" aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? '☼' : '◐'}
          </button>
        </div>
        <nav className="command-nav" aria-label="Seções da plataforma">
          <button type="button" className={screen === 'monitor' ? 'active' : ''} onClick={() => setScreen('monitor')}><span aria-hidden="true">◫</span> Visão geral</button>
          <button type="button" className={screen === 'sites' ? 'active' : ''} onClick={() => setScreen('sites')}><span aria-hidden="true">◎</span> Meus sites</button>
          <button type="button" className={screen === 'test' ? 'active' : ''} onClick={() => setScreen('test')}><span aria-hidden="true">⚡</span> Laboratório de falhas</button>
        </nav>

        <div className="sidebar-metrics">
          <div className="dashboard-tile compact">
            <span>Amostras positivas</span>
            <strong>{summary.successRate}</strong>
          </div>
          <div className="dashboard-tile compact">
            <span>Latência média</span>
            <strong>{summary.avgLatency}</strong>
          </div>
          <div className="dashboard-tile compact">
            <span>Últimos registros</span>
            <strong>{summary.savedRecords}</strong>
          </div>
        </div>

        <div className="status-panel">
          <div className="command-side-heading">STATUS DA CENTRAL</div>
          <div className={`status-pill ${currentHealthClass}`}><span className="pulse-dot" />{currentHealth}</div>
          <p className="panel-hint">Último registro: {latestTimestamp}</p>
          <p className="panel-hint">Verificações conforme agendamento. Estados estáveis são salvos a cada 10 minutos; mudanças geram novos registros.</p>
        </div>
      </aside>

      <main className="main-panel" id="conteudo">
        <header className="topbar">
          <div>
            <div className="eyebrow">CENTRAL DE COMANDO / JELTOPS</div>
            <h2>{screen === 'monitor' ? 'Visão geral' : screen === 'sites' ? 'Meus sites' : 'Laboratório de falhas'}</h2>
          </div>

          <nav className="monitor-tabs" aria-label="Áreas do aplicativo">
            <button type="button" className={screen === 'monitor' ? 'selected' : ''} onClick={() => setScreen('monitor')}>Visão geral</button>
            <button type="button" className={screen === 'sites' ? 'selected' : ''} onClick={() => setScreen('sites')}>Meus sites</button>
            <button type="button" className={screen === 'test' ? 'selected' : ''} onClick={() => setScreen('test')}>Laboratório</button>
          </nav>
        </header>

        {screen === 'monitor' ? <>
            <section className="command-hero" aria-label="Resumo da central de comando">
              <div className="command-hero-copy">
                <span className="command-kicker"><span className="command-beacon" aria-hidden="true"/> SISTEMA DE OBSERVABILIDADE</span>
                <h3>Sua infraestrutura.<br/><em>Sob controle.</em></h3>
                <p>Monitore a disponibilidade, identifique falhas e acompanhe a recuperação dos seus serviços.</p>
                <div className={`command-hero-state ${currentHealthClass}`}><span className="pulse-dot" aria-hidden="true"/>{currentHealth}</div>
              </div>
              <div className="command-hero-signal" aria-hidden="true">
                <div className="command-orbit orbit-one"/><div className="command-orbit orbit-two"/><div className="command-orbit orbit-three"/>
                <div className="command-signal-core">⌁</div>
                <span className="command-signal-caption">JELTOPS · ATIVO</span>
              </div>
            </section>
            <section className="command-quick-stats" aria-label="Indicadores gerais">
              <div className="command-quick-tile"><span>SERVIÇOS MONITORADOS</span><strong>{targetsLatest.length.toString().padStart(2, '0')}</strong><small>Alvos com registros</small></div>
              <div className="command-quick-tile"><span>AMOSTRAS POSITIVAS</span><strong>{summary.successRate}</strong><small>Nos registros carregados</small></div>
              <div className="command-quick-tile"><span>TEMPO DE RESPOSTA</span><strong>{summary.avgLatency}</strong><small>Média das amostras</small></div>
            </section>
            {activeFailures.length > 0 && (
              <div className="alert-banner">
                ⚠️ {activeFailures.length} serviço(s) com última resposta indicando falha.
              </div>
            )}

            <section className="target-summary" aria-label="Status dos sites">
              <div className="section-heading"><h3>Serviços monitorados</h3><span>{targetsLatest.length} alvos</span></div>
              {loading ? <div className="empty-small">Carregando monitoramento…</div> : dataError ? <div className="alert-banner" role="alert">{dataError}</div> : !targetsLatest.length ? <div className="empty-small">Sem registros. Confira a coleta e o Firestore.</div> :
                <div className="target-card-grid">{targetsLatest.map((item) => (
                  <article className="target-card" key={item.target}>
                    <div className="target-card-head"><span className={`status-pill-table ${item.status === 'UP' ? 'up' : 'down'}`}>{item.status === 'UP' ? '● Online' : '● Falha'}</span><strong>{formatMs(item.latencyMs)}</strong></div>
                    <h4>{item.target}</h4><p>HTTP {item.statusCode ?? '—'} · {item.timestamp instanceof Date ? item.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                  </article>
                ))}</div>}
            </section>
            <div className="filter-bar">
              <span className="filter-label">Filtrar</span>
              {targetOptions.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setSelectedTarget(target)}
                  className={selectedTarget === target ? 'filter-button active' : 'filter-button'}
                >
                  {target === 'ALL' ? 'Todos' : target}
                </button>
              ))}
            </div>

            <section className="overview-grid">
              <div className="dashboard-tile">
                <span>Latência média</span>
                <strong>{summary.avgLatency}</strong>
                <small>Tempo total da resposta</small>
              </div>
              <div className="dashboard-tile">
                <span>Resolução DNS</span>
                <strong>{summary.avgDns}</strong>
                <small>Tempo de resolução</small>
              </div>
              <div className="dashboard-tile">
                <span>Conexão TCP</span>
                <strong>{summary.avgTcp}</strong>
                <small>Abertura da conexão</small>
              </div>
              <div className="dashboard-tile">
                <span>Memória do monitor</span>
                <strong>{summary.avgMemory}</strong>
                <small>Memória do processo</small>
              </div>
            </section>

            <section className="charts-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>Histórico de latência</h3>
                  <span>{selectedTarget === 'ALL' ? 'Todos os serviços' : selectedTarget}</span>
                </div>

                <div className="chart-box">
                  {chartData.length === 0 ? (
                    <div className="empty-state">Aguardando métricas…</div>
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
                          name="Latência"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>DNS e TCP</h3>
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
                        <Area type="monotone" dataKey="dns" stroke="var(--amber-400)" fill="url(#dnsGradient)" strokeWidth={2} name="Resolução DNS" />
                        <Area type="monotone" dataKey="tcp" stroke="var(--violet-400)" fill="url(#tcpGradient)" strokeWidth={2} name="Conexão TCP" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </section>

            <section className="detail-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>Última execução</h3>
                  <span>{latestCheck?.target || 'Sem dados'}</span>
                </div>

                <div className="info-stack">
                  <div className="info-row">
                    <span>IP da requisição</span>
                    <strong>{latestCheck?.requestIp || 'Não informado'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Região do servidor</span>
                    <strong>{latestCheck?.serverRegion || latestCheck?.serverLocation?.region || 'Não informado'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Localização do servidor</span>
                    <strong>
                      {latestCheck?.serverLocation
                        ? `${latestCheck.serverLocation.city}, ${latestCheck.serverLocation.country}`
                        : 'Não informado'}
                    </strong>
                  </div>
                  <div className="info-row">
                    <span>Memória do monitor</span>
                    <strong>{latestCheck?.runtime?.memoryRssMb ? `${latestCheck.runtime.memoryRssMb}MB` : 'unknown'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Tempo de CPU</span>
                    <strong>{latestCheck?.runtime?.cpuUserMs ? `${latestCheck.runtime.cpuUserMs}ms` : 'unknown'}</strong>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Rede e execução</h3>
                  <span>Verificação recente</span>
                </div>

                <div className="mini-stats">
                  <div>
                    <label>Código HTTP</label>
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
                <h3>Histórico de verificações</h3>
                <span>{filteredLogs.length} registros</span>
              </div>

              <div className="mobile-history" aria-label="Histórico compacto">
                {currentLogs.length === 0 ? <div className="empty-small">Sem registros para este filtro.</div> :
                  currentLogs.map((log) => <article className="history-card" key={log.id}>
                    <div className="history-card-head"><span className={`status-pill-table ${log.status === 'UP' ? 'up' : 'down'}`}>{log.status === 'UP' ? 'Online' : log.status === 'DOWN' ? 'Falha' : '—'}</span><time>{log.timestamp instanceof Date ? log.timestamp.toLocaleString('pt-BR') : log.timeFormatted}</time></div>
                    <div className="history-card-main"><strong>{log.target}</strong><b>{formatMs(log.latencyMs)}</b></div>
                    <div className="history-card-meta"><span>HTTP {log.statusCode ?? '—'}</span><span>DNS {formatMs(log.dnsLookupMs)}</span><span>TCP {formatMs(log.tcpConnectMs)}</span></div>
                  </article>)}
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Serviço</th>
                      <th>Latência</th>
                      <th>DNS</th>
                      <th>TCP</th>
                      <th>HTTP</th>
                      <th>IP</th>
                      <th>Região</th>
                      <th>Horário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLogs.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="empty-row">
                          Aguardando registros...
                        </td>
                      </tr>
                    ) : (
                      currentLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <span className={`status-pill-table ${log.status === 'UP' ? 'up' : 'down'}`}>
                              {log.status === 'UP' ? 'Online' : log.status === 'DOWN' ? 'Falha' : 'Desconhecido'}
                            </span>
                          </td>
                          <td>{log.target}</td>
                          <td>{formatMs(log.latencyMs)}</td>
                          <td>{formatMs(log.dnsLookupMs)}</td>
                          <td>{formatMs(log.tcpConnectMs)}</td>
                          <td>{log.statusCode ?? 0}</td>
                          <td>{log.requestIp || 'Não informado'}</td>
                          <td>{log.serverRegion || 'Não informado'}</td>
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
                    Anterior
                  </button>
                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </section>
        </> : screen === 'sites' ? <MySites /> : <Laboratory logs={logs} />}
      </main>
      <nav className="mobile-dock" aria-label="Navegação principal">
        <button type="button" className={screen === 'monitor' ? 'selected' : ''} onClick={() => {setScreen('monitor'); window.scrollTo({top:0,behavior:'smooth'});}}><span className="dock-icon" aria-hidden="true">◫</span><span>Visão geral</span></button>
        <button type="button" className={screen === 'sites' ? 'selected' : ''} onClick={() => {setScreen('sites'); window.scrollTo({top:0,behavior:'smooth'});}}><span className="dock-icon" aria-hidden="true">◎</span><span>Meus sites</span></button>
        <button type="button" className={screen === 'test' ? 'selected' : ''} onClick={() => {setScreen('test'); window.scrollTo({top:0,behavior:'smooth'});}}><span className="dock-icon" aria-hidden="true">⚡</span><span>Laboratório</span></button>
      </nav>
    </div>
  );
}

export default App;
