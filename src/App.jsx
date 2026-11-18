import CheckHistory from './components/CheckHistory';
import { rememberPublicHistory, requestPublicHistory } from './publicHistory';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import {monitorRequest} from './monitorAccount';
import MyProfile from './components/MyProfile';
import MonitorAdmin from './components/MonitorAdmin';
import Notifications from './components/Notifications';
import NotificationPreferences from './components/NotificationPreferences';
import AccountAvatar from './components/AccountAvatar';
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
import NavigationRadar from './components/NavigationRadar';
import './App.css';
import './MissionControl.css';

const formatMs = (value, digits = 0) => {
  const safeValue = Number(value ?? 0);
  if (!Number.isFinite(safeValue)) return '0ms';
  return `${safeValue.toFixed(digits)}ms`;
};

const formatPercent = (value) => `${Number(value ?? 0).toFixed(1)}%`;

const desktopLayout = '(min-width: 1025px)';

function App() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(desktopLayout).matches);
  useEffect(() => {
    const media = window.matchMedia(desktopLayout);
    const update = () => setIsDesktop(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);

  const [theme, setTheme] = useState(() => window.localStorage.getItem('jeltops-theme') || 'dark');
  const [dataError, setDataError] = useState('');
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('ALL');
  const [screen, setScreen] = useState('monitor');
  const [previousScreen,setPreviousScreen] = useState('monitor');
  const [accountUser, setAccountUser] = useState(null);
  const [accountProfile, setAccountProfile] = useState(null);
  const [notificationSlot, setNotificationSlot] = useState(null);
  useEffect(() => onAuthStateChanged(auth, setAccountUser, () => setAccountUser(null)), []);
  useEffect(() => {
    let active = true;
    setAccountProfile(null);
    if (accountUser) monitorRequest('/api/meus-sites?view=profile')
      .then(({profile}) => { if (active) setAccountProfile(profile); }).catch(()=>{});
    return () => {active=false};
  }, [accountUser]);

  const [demoRunId, setDemoRunId] = useState(null);
  const [labReport, setLabReport] = useState(null);
  const [demoVisible, setDemoVisible] = useState(false);
  const [hiddenRunId, setHiddenRunId] = useState(null);
  const [demoSeconds, setDemoSeconds] = useState(null);

  const startDemo = (runId) => {
    setDemoRunId(runId);
    setLabReport(null);
    setHiddenRunId(null);
    setDemoVisible(true);
  };

  const updateDemoReport = useCallback((serverReport) => {
    const report = { ...serverReport, receivedAtMs: Date.now() };
    setLabReport((previous) => {
      if (previous?.runId !== report.runId) {
        if (previous?.runId && (!report.runId || previous.endsAtMs > report.endsAtMs)) return previous;
        return report;
      }

      // A refresh begun before a measurement may finish after the measurement request.
      const samples = new Map(previous.observedChecks.map((check) => [check.id, check]));
      for (const check of report.observedChecks) {
        const saved = samples.get(check.id);
        if (!saved || saved.observedAtMs <= check.observedAtMs) samples.set(check.id, check);
      }
      return { ...report, observedChecks: [...samples.values()] };
    });
  }, []);

  useEffect(() => {
    if (screen !== 'monitor') return;

    const controller = new AbortController();
    let timer;
    const refresh = async () => {
      try {
        if (document.visibilityState === 'hidden') return;
        const path = demoVisible ? '/api/lab-observe' : '/api/lab-observe?watch=1';
        const response = await fetch(path, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) return;
        const report = await response.json();
        if (controller.signal.aborted) return;
        if (demoVisible) updateDemoReport(report);
        else if (report.runId && report.runId !== hiddenRunId) setDemoVisible(true);
      } catch {
        // Retry transient failures while the overview is visible.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, demoVisible ? 3000 : 5000);
      }
    };

    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [screen, demoVisible, hiddenRunId, updateDemoReport]);


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

      rememberPublicHistory(transformed);
      setLogs(transformed);
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
  const showDemo = screen === 'monitor' && demoVisible;
  const demoReport = labReport;
  const demoChecks = [...(demoReport?.observedChecks ?? [])].sort((a, b) => a.observedAtMs - b.observedAtMs);
  const confirmedChecks = demoChecks.filter((check) => !check.error &&
    ((check.phase === 'outage' && check.statusCode === 503 && check.status === 'DOWN') ||
      (['baseline', 'recovery'].includes(check.phase) && check.statusCode === 200 && check.status === 'UP')));
  const demoLatest = confirmedChecks.at(-1);
  const demoRecovered = demoLatest?.phase === 'recovery' && confirmedChecks.some((check) => check.phase === 'outage');
  const demoFailed = showDemo && demoLatest?.status === 'DOWN';
  const demoDeadline = Number.isFinite(demoReport?.endsAtMs)
    ? demoReport.endsAtMs - demoReport.serverNowMs + demoReport.receivedAtMs : null;

  useEffect(() => {
    if (!demoFailed || !Number.isFinite(demoDeadline)) {
      setDemoSeconds(null);
      return;
    }
    const tick = () => setDemoSeconds(Math.max(0, Math.ceil((demoDeadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [demoFailed, demoDeadline]);

  const verifyingRecovery = demoFailed && demoSeconds === 0;
  const activeFailures = targetsLatest.filter((item) => item.status === 'DOWN');
  const hasActiveFailure = activeFailures.length > 0 || demoFailed;
  const lastCheckAgeMs = logs[0]?.timestamp instanceof Date ? Date.now() - logs[0].timestamp.getTime() : Infinity;
  const dataStale = lastCheckAgeMs > 30 * 60 * 1000;
  const currentHealth = demoFailed ? 'Atenção' : loading ? 'Verificando' : dataError ? 'Indisponível' : !logs.length ? 'Sem dados' : dataStale ? 'Dados antigos' : activeFailures.length ? 'Atenção' : 'Operacional';
  const currentHealthClass = hasActiveFailure || dataError ? 'degraded' : !logs.length || dataStale ? 'neutral' : 'ok';
  const latestTimestamp = logs[0]?.timestamp instanceof Date ? logs[0].timestamp.toLocaleString('pt-BR') : 'Aguardando';

  const quickStats = (
    <section className="command-quick-stats" aria-label="Indicadores gerais">
              <div className="command-quick-tile"><span>SERVIÇOS MONITORADOS</span><strong>{targetsLatest.length.toString().padStart(2, '0')}</strong><small>Alvos com registros</small></div>
              <div className="command-quick-tile"><span>AMOSTRAS POSITIVAS</span><strong>{summary.successRate}</strong><small>{selectedTarget === 'ALL' ? 'Serviços de referência' : selectedTarget}</small></div>
              <div className="command-quick-tile"><span>TEMPO DE RESPOSTA</span><strong>{summary.avgLatency}</strong><small>Média das amostras</small></div>
            </section>
  );

  const accountActions = (
    <div className="account-header-actions">
      <button type="button" className="theme-toggle" aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}>
        {theme === 'dark' ? '☼' : '◐'}
      </button>
      {accountUser && <span className="notification-trigger-slot" ref={setNotificationSlot} />}
      <button className="account-header-button" type="button" aria-label="Meu perfil" title="Meu perfil"
        aria-current={screen==='profile'?'page':undefined} onClick={()=>{setScreen('profile');window.scrollTo(0,0);}}>
        {accountUser ? <AccountAvatar name={accountProfile?.name || accountUser.displayName} photo={accountProfile?.photo}/>
          : <span aria-hidden="true">♙</span>}
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      <Notifications user={accountUser} triggerSlot={notificationSlot}
        onSettings={()=>{
          if (screen!=='notification-preferences') setPreviousScreen(screen);
          setScreen('notification-preferences');window.scrollTo(0,0);
        }}
        onProfile={()=>{setScreen('profile');window.scrollTo(0,0);}} />
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside className="sidebar-panel">
        <div className="brand-block">
          <div className="command-brand"><span className="command-brand-mark" aria-hidden="true">⌁</span><div><h1>Jelt<span>Ops</span></h1><span className="brand-caption">CENTRAL DE COMANDO</span></div></div>
          {!isDesktop && accountActions}
        </div>
        <nav className="command-nav" aria-label="Seções da plataforma">
          <button type="button" className={screen === 'monitor' ? 'active' : ''} onClick={() => setScreen('monitor')}><span aria-hidden="true">◫</span> Visão geral</button>
          <button type="button" className={screen === 'sites' ? 'active' : ''} onClick={() => setScreen('sites')}><span aria-hidden="true">◎</span> Meus sites</button>
          <button type="button" className={screen === 'test' ? 'active' : ''} onClick={() => setScreen('test')}><span aria-hidden="true">⚡</span> Laboratório de falhas</button>
        </nav>

        <div className="sidebar-metrics">
          <div className="dashboard-tile compact">
            <span>Amostras positivas · referências</span>
            <strong>{summary.successRate}</strong>
          </div>
          <div className="dashboard-tile compact">
            <span>Latência média</span>
            <strong>{summary.avgLatency}</strong>
          </div>
          <div className="dashboard-tile compact">
            <span>Amostras recentes</span>
            <strong>{summary.savedRecords}</strong>
            <small>Até 120 registros salvos</small>
          </div>
        </div>

        <div className="status-panel">
          <div className="command-side-heading">STATUS DA CENTRAL</div>
          <div className={`status-pill ${currentHealthClass}`} aria-live="polite"><span className="pulse-dot" />{currentHealth}</div>
          <p className="panel-hint">Último registro: {latestTimestamp}</p>
          <p className="panel-hint">Verificações conforme agendamento. Estados estáveis são salvos a cada 10 minutos; mudanças geram novos registros.</p>
        </div>
      </aside>

      <main className="main-panel" id="conteudo">
        <header className="topbar">
          <div>
            <div className="eyebrow">CENTRAL DE COMANDO / JELTOPS</div>
            <h2>{screen === 'monitor' ? 'Visão geral' : screen === 'sites' ? 'Meus sites' : screen === 'profile' ? 'Meu perfil' : screen === 'admin' ? 'Administração' : screen === 'notification-preferences' ? 'Preferências de notificações' : 'Laboratório de falhas'}</h2>
          </div>

          {isDesktop ? accountActions :
            <nav className="monitor-tabs" aria-label="Áreas do aplicativo">
              <button type="button" className={screen === 'monitor' ? 'selected' : ''} onClick={() => setScreen('monitor')}>Visão geral</button>
              <button type="button" className={screen === 'sites' ? 'selected' : ''} onClick={() => setScreen('sites')}>Meus sites</button>
              <button type="button" className={screen === 'test' ? 'selected' : ''} onClick={() => setScreen('test')}>Laboratório</button>
            </nav>}
        </header>

        {screen === 'monitor' ? <>
            <section className={showDemo ? 'command-hero is-demonstrating' : 'command-hero'} aria-label="Resumo da central de comando">
              <div className="command-hero-copy">
                <span className="command-kicker"><span className="command-beacon" aria-hidden="true"/> SISTEMA DE OBSERVABILIDADE</span>
                <h3>Sua infraestrutura.<br/><em>Sob controle.</em></h3>
                <p className="command-hero-description">Monitore a disponibilidade, identifique falhas e acompanhe a recuperação dos seus serviços.</p>
                <div className={`command-hero-state ${currentHealthClass}`}><span className="pulse-dot" aria-hidden="true"/>{currentHealth}</div>
                <p className="command-mobile-check">
                  {demoFailed ? 'Serviço experimental · HTTP 503 observado' : 'Último registro: '+latestTimestamp}
                </p>
              </div>
              <div className={['command-hero-signal', currentHealthClass, demoFailed ? 'signal-demo-failure' : ''].join(' ')}>
                <div className="command-orbit orbit-one" aria-hidden="true"/><div className="command-orbit orbit-two" aria-hidden="true"/><div className="command-orbit orbit-three" aria-hidden="true"/>
                <div className="command-signal-core">
                  {verifyingRecovery ? <span className="command-signal-verifying" role="status">{demoReport?.recoveryRetriesExhausted ? 'Recuperação não confirmada' : 'Verificando recuperação'}</span>
                    : demoFailed && demoSeconds > 0 ? <span className="command-signal-timer" role="timer">
                      <strong>{demoSeconds}<small>s</small></strong><span>restantes</span>
                    </span> : <span aria-hidden="true">⌁</span>}
                </div>
                <span className="command-signal-caption" aria-hidden="true">JELTOPS · {currentHealthClass === 'ok' ? 'ATIVO' : currentHealth.toUpperCase()}</span>
              </div>
            </section>
            {!showDemo && <div className="command-stats-desktop">{quickStats}</div>}
            {hasActiveFailure && (
              <div className="alert-banner" role="status">
                {demoFailed && <div>⚠️ Demonstração · Falha no serviço experimental · HTTP 503 observado.</div>}
                {activeFailures.length > 0 && <div>⚠️ {activeFailures.length} serviço(s) com última resposta indicando falha.</div>}
              </div>
            )}
            {!showDemo && (
              <button type="button" className="filter-button" onClick={() => {
                setHiddenRunId(null);
                setDemoVisible(true);
              }}>Acompanhar demonstração</button>
            )}
            {showDemo && (
              <section className="target-summary" aria-label="Modo demonstração">
                <div className="section-heading">
                  <h3>Modo demonstração</h3>
                  <button type="button" className="filter-button demo-hide-button" onClick={() => { setHiddenRunId(labReport?.runId ?? demoRunId); setDemoVisible(false); }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
                      <path d="M6.5 6.5C3.6 8.2 2 12 2 12s3.6 6 10 6a9.8 9.8 0 0 0 5.5-1.6M10 6.2a9 9 0 0 1 2-.2c6.4 0 10 6 10 6a13 13 0 0 1-2 2.5"/>
                    </svg>
                    Ocultar demonstração
                  </button>
                </div>
                <article className="target-card" aria-live="polite">
                  <div className="target-card-head">
                    <span className={`status-pill-table ${demoLatest?.status === 'DOWN' ? 'down' : demoLatest ? 'up' : ''}`}>
                      {demoRecovered ? '● Recuperado' : demoLatest?.status === 'DOWN' ? '● Falha' : demoLatest ? '● Online' : 'Aguardando medição'}
                    </span>
                    <strong>{demoLatest ? formatMs(demoLatest.latencyMs) : '—'}</strong>
                  </div>
                  <h4>Serviço experimental</h4>
                  <p>{demoLatest ? `HTTP ${demoLatest.statusCode} · ${new Date(demoLatest.observedAtMs).toLocaleTimeString('pt-BR')}` : 'Aguardando resposta HTTP observada pelo monitor.'}</p>
                  {demoChecks.length > 0 && (
                    <ol aria-label="Histórico da demonstração">
                      {demoChecks.map((check) => (
                        <li key={check.id || check.phaseKey}>
                          {new Date(check.observedAtMs).toLocaleTimeString('pt-BR')} · {check.statusCode ? `HTTP ${check.statusCode}` : 'Sem resposta HTTP'} · {formatMs(check.latencyMs)}
                          {check.error && ' · Medição inconclusiva'}
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              </section>
            )}

            {showDemo && <div className="command-stats-desktop">{quickStats}</div>}
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
            <div className="command-stats-mobile">{quickStats}</div>
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
                  <span>Tempos de rede</span>
                </div>

                <div className="chart-box">
                  {chartData.length === 0 ? (
                    <div className="empty-state">Aguardando métricas…</div>
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
                    <span>Região da verificação</span>
                    <strong>{latestCheck?.serverRegion || latestCheck?.serverLocation?.region || 'Não informado'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Origem da verificação</span>
                    <strong>
                      {latestCheck?.serverLocation
                        ? `${latestCheck.serverLocation.city}, ${latestCheck.serverLocation.country}`
                        : 'Não informado'}
                    </strong>
                  </div>
                  <div className="info-row">
                    <span>Memória do monitor</span>
                    <strong>{latestCheck?.runtime?.memoryRssMb ? `${latestCheck.runtime.memoryRssMb}MB` : 'Não informado'}</strong>
                  </div>
                  <div className="info-row">
                    <span>Tempo de CPU</span>
                    <strong>{latestCheck?.runtime?.cpuUserMs ? `${latestCheck.runtime.cpuUserMs}ms` : 'Não informado'}</strong>
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
                    <strong>{latestCheck?.runtime?.heapUsedMb ? `${latestCheck.runtime.heapUsedMb}MB` : 'Não informado'}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel table-panel">
              <div className="panel-header">
                <h3>Histórico de verificações</h3>
              </div>

              <CheckHistory load={requestPublicHistory} services={['Google Endpoint', 'YouTube Main API']} revision={logs[0]?.id}>
                {rows => <VerificationRows rows={rows} />}
              </CheckHistory>
            </section>
        </> : screen === 'sites' ? <MySites /> : screen === 'profile' ?
          <MyProfile key={accountUser?.uid ?? 'guest'} user={accountUser} onProfile={setAccountProfile}
            onSites={()=>{setScreen('sites');window.scrollTo(0,0);}}
            onAdmin={()=>{setScreen('admin');window.scrollTo(0,0);}}/> :
          screen === 'admin' ? <MonitorAdmin key={accountUser?.uid ?? 'guest'}
            onBack={()=>{setScreen('profile');window.scrollTo(0,0);}}/> :
          screen === 'notification-preferences' && accountUser ?
            <NotificationPreferences key={accountUser.uid} onBack={()=>{setScreen(previousScreen);window.scrollTo(0,0);}}/> : null}
        {(screen === 'test' || demoRunId) && (
          <div hidden={screen !== 'test'}>
            <Laboratory onRunStarted={startDemo} onReport={updateDemoReport} demoRunId={demoRunId} visible={screen === 'test'}
              onShowDemo={() => { setDemoVisible(true); setScreen('monitor'); window.scrollTo(0, 0); }} />
          </div>
        )}
        <footer className="jeltops-about">
          <details>
            <summary>Sobre o JeltOps</summary>
            <p>Projeto acadêmico de monitoramento sintético HTTP. O JeltOps consulta sites públicos, registra o tempo de resposta e reúne evidências de falhas e recuperações no laboratório.</p>
            <a href="https://github.com/camotio022/JeltOps">Repositório do projeto</a>
          </details>
        </footer>
      </main>
      <NavigationRadar screen={screen} onNavigate={destination=>{
        setScreen(destination);
        window.scrollTo(0,0);
      }} />
    </div>
  );
}

export default App;


function VerificationRows({ rows }) {
  const label = log => log.recovered ? 'Recuperado' : log.status === 'UP' ? 'Online' : log.status === 'DOWN' ? 'Falha' : 'Inconclusivo';
  const status = log => <span className={`status-pill-table ${log.status === 'UP' ? 'up' : log.status === 'DOWN' ? 'down' : ''}`}>{label(log)}</span>;
  const date = log => <time dateTime={log.timestamp}>{new Date(log.timestamp).toLocaleString('pt-BR')}</time>;
  return <>
    <div className="mobile-history" aria-label="Histórico compacto">
      {rows.map(log => <article className="history-card" key={log.id}>
        <div className="history-card-head">{status(log)}{date(log)}</div>
        <div className="history-card-main"><strong>{log.target}</strong><b>{formatMs(log.latencyMs)}</b></div>
        <div className="history-card-meta"><span>HTTP {log.statusCode || '—'}</span><span>DNS {formatMs(log.dnsLookupMs)}</span><span>TCP {formatMs(log.tcpConnectMs)}</span></div>
      </article>)}
    </div>
    <div className="table-wrapper">
      <table>
        <thead><tr>
          {['Status', 'Serviço', 'Latência', 'DNS', 'TCP', 'HTTP', 'IP', 'Região', 'Data e hora'].map(heading => <th key={heading} scope="col">{heading}</th>)}
        </tr></thead>
        <tbody>{rows.map(log => <tr key={log.id}>
          <td>{status(log)}</td><td>{log.target}</td><td>{formatMs(log.latencyMs)}</td>
          <td>{formatMs(log.dnsLookupMs)}</td><td>{formatMs(log.tcpConnectMs)}</td><td>{log.statusCode || '—'}</td>
          <td>{log.requestIp || '—'}</td><td>{log.serverRegion || '—'}</td><td>{date(log)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
