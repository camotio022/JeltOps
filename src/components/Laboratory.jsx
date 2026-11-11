import { useCallback, useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import './Laboratory.css';

const formatTime = (value) => value ? new Date(value).toLocaleTimeString('pt-BR') : '—';

export default function Laboratory({ logs = [] }) {
  const [state, setState] = useState(null);
  const [user, setUser] = useState(undefined);
  const [presenterCode, setPresenterCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => onAuthStateChanged(auth, setUser, () => setUser(null)), []);
  const authenticatedRequest = async (action, extra = {}) => {
    const current = auth.currentUser;
    if (!current) throw new Error('Entre com o Google para autorizar o experimento.');
    const bearer = await current.getIdToken();
    const response = await fetch('/api/lab-control', {
      method:'POST', cache:'no-store',
      headers:{'Content-Type':'application/json',Authorization:'Bearer ' + bearer},
      body:JSON.stringify({action,...extra})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível autorizar o laboratório.');
    return result;
  };
  const signIn = async () => {
    setError('');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user') setError('Não foi possível entrar com Google. Abra o JeltOps no navegador Safari ou Chrome.'); }
  };
  const issueCode = async () => {
    setRunning(true);setError('');
    try {
      const data = await authenticatedRequest('issue_code');
      setIssuedCode(data.code);
      setPresenterCode('');
      setCodeExpiresAt(data.expiresAtMs);
    } catch(e) {setError(e.message)} finally {setRunning(false)}
  };
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [report, setReport] = useState({simulatedEvents:[],observedChecks:[]});
  const events = [...report.simulatedEvents, ...report.observedChecks].sort((a,b)=>(b.observedAtMs||b.timestamp?.seconds*1000||0)-(a.observedAtMs||a.timestamp?.seconds*1000||0));

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/lab-target', { cache:'no-store' });
      const result = await response.json();
      if (result?.service !== 'jeltops-lab') throw new Error(result.error || 'Falha ao consultar laboratório');
      // Even HTTP 503 is a valid, measured response in this experiment.
      setState({ ...result, endsAt:result.recoveryAt, statusCode:response.status });
      const evidence = await fetch('/api/lab-observe', {cache:'no-store'});
      if (evidence.ok) setReport(await evidence.json());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(refresh, state?.status === 'DOWN' ? 3000 : 30000);
    return () => clearInterval(timer);
  }, [refresh, state?.status]);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil(((state?.endsAt ? new Date(state.endsAt).getTime() : 0) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state?.endsAt]);

  const start = async () => {
    if (!/^\d{6}$/.test(presenterCode)) { setError('Informe o código de seis dígitos gerado para esta sessão.'); return; }
    setRunning(true);
    try {
      const body = await authenticatedRequest('start', {code:presenterCode});
      setPresenterCode('');
      setIssuedCode('');
      setCodeExpiresAt(0);
      await refresh();
      if (body.observationToken && body.runId) {
        const observe = async () => {
          try {
            const response = await fetch('/api/lab-observe', {
              method:'POST',
              headers:{'Content-Type':'application/json','x-lab-observation-token':body.observationToken},
              body:JSON.stringify({runId:body.runId})
            });
            if (!response.ok) throw new Error('A medição independente não foi concluída.');
            const reportResponse = await fetch('/api/lab-observe', {cache:'no-store'});
            if (reportResponse.ok) setReport(await reportResponse.json());
          } catch(err) { setError(err.message); }
        };
        await observe();
        setTimeout(observe, 10_000);
        setTimeout(observe, 34_000);
      }

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
      <span className="eyebrow">DEMONSTRAÇÃO · SERVIÇO EXPERIMENTAL</span>
      <h2>Provoque a falha.<br/>Veja a recuperação.</h2>
      <p>Simule uma resposta HTTP 503 e acompanhe o retorno automático ao HTTP 200 em 30 segundos.</p>
    </header>
    <article className="lab-status-panel">
      <div className="lab-status-top">
        <span className="lab-chip">SERVIÇO EXPERIMENTAL</span>
        <span className="lab-timing">Atualização rápida durante o teste</span>
      </div>
      <div className="lab-current-status">
        <div className={`lab-status-dot ${state ? (isDown ? 'is-down' : 'is-up') : 'is-idle'}`} aria-hidden="true"/>
        <div>
          <span className="lab-current-title">{state ? showPhase : 'Carregando status…'}</span>
          <strong>{state ? `HTTP ${state.statusCode}` : '—'}</strong>
        </div>
      </div>
      {isDown && <div className="lab-recovery-counter" role="status">Recuperação automática em <strong>{remaining}s</strong></div>}
      <p className="lab-note">Somente o laboratório é afetado. Os outros sites continuam disponíveis.</p>
      <div className="lab-access-label">Autorização do apresentador com Google</div>
      {!user ? <button type="button" className="lab-check-button" onClick={signIn}>Entrar com Google</button> : <>
        <p className="lab-note">Conectado: {user.email}. Somente contas autorizadas podem iniciar experimentos.</p>
        <button type="button" className="lab-check-button" disabled={running || isDown} onClick={issueCode}>
          {running ? 'Aguarde…' : 'Gerar código temporário'}
        </button>
        {issuedCode && <p className="lab-note" role="status">Código para esta sessão: <strong>{issuedCode}</strong> · válido por 5 minutos. Não compartilhe.</p>}
        <label className="lab-access-label" htmlFor="lab-access">Código de confirmação</label>
        <input id="lab-access" className="lab-access-input" type="text" inputMode="numeric" maxLength={6}
          autoComplete="one-time-code" placeholder="000000" value={presenterCode}
          onChange={(e)=>setPresenterCode(e.target.value.replace(/\D/g,'').slice(0,6))}/>
        <button type="button" className="lab-check-button lab-danger" disabled={running || isDown || !state || !issuedCode || Date.now() > codeExpiresAt}
          onClick={start}>{running ? 'Iniciando…' : '⚡ Provocar falha agora'}</button>
      </>}
      {error && <div className="lab-error" role="alert">{error}</div>}
    </article>
    <div className="lab-three-phases">
      <div><span className="phase-number">01</span><strong>Operando</strong><small>HTTP 200</small></div>
      <div><span className="phase-number">02</span><strong>Falha</strong><small>HTTP 503 · 30s</small></div>
      <div><span className="phase-number">03</span><strong>Recuperação</strong><small>HTTP 200</small></div>
    </div>
    <article className="lab-log-panel">
      <div className="section-heading"><h3>Relatório exclusivo do laboratório</h3><span>{events.length} registros visíveis</span></div>
      {!events.length ? <p className="lab-muted">Ainda não há registros de demonstração.</p> :
        <ol className="lab-events">{events.map((item) => <li key={item.id}>
          <span className={`lab-event-icon ${item.status === 'UP' ? 'is-up' : 'is-down'}`}>{item.status === 'UP' ? '✓' : '!'}</span>
          <span><strong>{item.kind === 'independent-http-observation' ? 'Medição HTTP independente' : item.eventType === 'BASELINE' ? 'Condição inicial simulada' : item.eventType === 'SIMULATED_RECOVERY' ? 'Recuperação simulada' : 'Falha provocada'}</strong>
            <small>HTTP {item.statusCode} · {formatTime(item.observedAtMs || item.timestamp)}</small></span>
        </li>)}</ol>}
      <p className="lab-disclaimer">Eventos provocados e medições independentes são identificados separadamente. Este experimento não afeta a disponibilidade dos sites reais. As medições dependem da sessão de apresentação permanecer aberta.</p>
    </article>
  </section>;
}
