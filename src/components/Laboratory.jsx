import { useCallback, useEffect, useState } from 'react';
import './Laboratory.css';

const formatTime = (value) => value ? new Date(value).toLocaleTimeString('pt-BR') : '—';

export default function Laboratory({ logs = [] }) {
  const [state, setState] = useState(null);
  const [token, setToken] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const events = logs.filter((item) => item.target === 'JeltOps Laboratory').slice(0, 12);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/lab-control', { cache:'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao consultar laboratório');
      setState(result);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil(((state?.endsAt ? new Date(state.endsAt).getTime() : 0) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state?.endsAt]);

  const start = async () => {
    if (!token.trim()) { setError('Informe a chave de apresentação configurada na Vercel.'); return; }
    setRunning(true);
    try {
      const response = await fetch('/api/lab-control', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-lab-control-token':token},
        body:JSON.stringify({action:'start'})
      });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? 'Chave incorreta.' : body.error || 'Não foi possível iniciar');
      setToken('');
      await refresh();
      // HTTP 503 is expected during the simulated outage; not a network error.
      await fetch('/api/lab-target', {cache:'no-store'}).catch(() => {});
    } catch(err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const isDown = state?.status === 'DOWN';
  const showPhase = isDown ? 'Indisponível' : state?.phase === 'RECOVERED' ? 'Recuperado' : 'Operando';

  return <section className="lab-page" aria-label="Teste real de falha e recuperação">
    <header className="lab-heading">
      <span className="eyebrow">JELTOPS · DEMONSTRAÇÃO CONTROLADA</span>
      <h2>Teste de falha e recuperação</h2>
      <p>Provoca HTTP 503 somente no serviço experimental. Após 30 segundos ele volta automaticamente para HTTP 200.</p>
    </header>
    <article className="lab-status-panel">
      <div className="lab-status-top">
        <span className="lab-chip">Serviço experimental</span>
        <span className="lab-timing">Verificação a cada 4 segundos nesta tela</span>
      </div>
      <div className="lab-current-status">
        <div className={`lab-status-dot ${state ? (isDown ? 'is-down' : 'is-up') : 'is-idle'}`} aria-hidden="true"/>
        <div>
          <span className="lab-current-title">{state ? showPhase : 'Carregando status…'}</span>
          <strong>{state ? `HTTP ${state.statusCode}` : '—'}</strong>
        </div>
      </div>
      {isDown && <div className="lab-recovery-counter" role="status">Recuperação automática em <strong>{remaining}s</strong></div>}
      <p className="lab-note">Este serviço simula uma falha HTTP; Google, YouTube e o próprio PWA continuam disponíveis.</p>
      <label className="lab-access-label" htmlFor="lab-access">Chave do apresentador</label>
      <input id="lab-access" className="lab-access-input" type="password" autoComplete="off" placeholder="Chave configurada na Vercel" value={token} onChange={(e)=>setToken(e.target.value)}/>
      <button type="button" className="lab-check-button lab-danger" disabled={running || isDown || !state} onClick={start}>{running ? 'Iniciando…' : '⏻ Simular queda agora'}</button>
      {error && <div className="lab-error" role="alert">{error}</div>}
    </article>
    <div className="lab-three-phases">
      <div><span className="phase-number">01</span><strong>Operando</strong><small>HTTP 200</small></div>
      <div><span className="phase-number">02</span><strong>Falha</strong><small>HTTP 503 · 30s</small></div>
      <div><span className="phase-number">03</span><strong>Recuperação</strong><small>HTTP 200</small></div>
    </div>
    <article className="lab-log-panel">
      <div className="section-heading"><h3>Histórico no Firebase</h3><span>{events.length} registros visíveis</span></div>
      {!events.length ? <p className="lab-muted">Ainda não há registros de demonstração.</p> :
        <ol className="lab-events">{events.map((item) => <li key={item.id}>
          <span className={`lab-event-icon ${item.status === 'UP' ? 'is-up' : 'is-down'}`}>{item.status === 'UP' ? '✓' : '!'}</span>
          <span><strong>{item.eventType === 'BASELINE' ? 'Operando antes do teste' : item.eventType === 'RECOVERY_DETECTED' ? 'Recuperação registrada' : item.status === 'DOWN' ? 'Falha provocada' : 'Online'}</strong>
            <small>HTTP {item.statusCode} · {formatTime(item.timestamp)}</small></span>
        </li>)}</ol>}
      <p className="lab-disclaimer">Queda registrada na ação autorizada e recuperação registrada na primeira consulta após 30 segundos. Não representa detecção pelo cron de 60 segundos; essa medição é uma etapa separada.</p>
    </article>
  </section>;
}
