import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import './Laboratory.css';

const clock = value => value ? new Date(value).toLocaleTimeString('pt-BR') : '—';
const number = value => Number.isFinite(value) ? Math.round(value) + ' ms' : '—';
const phaseLabels = {
  baseline: 'Estado inicial confirmado',
  outage: 'Falha detectada',
  recovery: 'Recuperação confirmada'
};
const labelFor = item => item.kind === 'independent-http-observation'
  ? item.error ? 'Medição inconclusiva' : phaseLabels[item.phase] || 'Medição independente'
  : item.eventType === 'BASELINE' ? 'Estado inicial registrado'
  : item.eventType === 'SIMULATED_RECOVERY' ? 'Recuperação provocada' : 'Falha provocada';

export default function Laboratory({ onRunStarted, onReport, demoRunId, onShowDemo, visible }) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 640px)');
    const update = () => setCompact(viewport.matches);
    viewport.addEventListener('change', update);
    return () => viewport.removeEventListener('change', update);
  }, []);
  const [service, setService] = useState(null);
  const [report, setReport] = useState({simulatedEvents:[],observedChecks:[]});
  const [user, setUser] = useState(undefined);
  const [code, setCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const timers = useRef([]);
  const mounted = useRef(false);
  useEffect(() => onAuthStateChanged(auth,setUser,()=>setUser(null)),[]);
  useEffect(()=>{
    mounted.current = true;
    return ()=>{
      mounted.current = false;
      timers.current.forEach(clearTimeout);
    };
  },[]);

  const refresh = useCallback(async () => {
    try {
      const [response, evidence] = await Promise.all([
        fetch('/api/lab-target',{cache:'no-store'}),
        fetch('/api/lab-observe',{cache:'no-store'})
      ]);
      const body = await response.json();
      if(body?.service !== 'jeltops-lab') throw new Error(body?.error || 'Laboratório indisponível.');
      setService({...body, httpCode:response.status});
      if(evidence.ok) setReport(await evidence.json());
    } catch(e) {setError(e.message)}
  },[]);

  useEffect(()=>{if(!visible)return;refresh();const id=setInterval(refresh,service?.status==='DOWN'?3000:30000);return()=>clearInterval(id)},[refresh,service?.status,visible]);
  useEffect(()=>{if(!visible)return;const tick=()=>setSeconds(Math.max(0,Math.ceil((new Date(service?.recoveryAt||service?.endsAt||0).getTime()-Date.now())/1000)));tick();const id=setInterval(tick,1000);return()=>clearInterval(id)},[service?.recoveryAt,service?.endsAt,visible]);

  useEffect(() => {
    if (demoRunId && report.runId === demoRunId) onReport(report);
  }, [demoRunId, onReport, report]);

  const authorized = async(action, extra={})=>{
    if(!auth.currentUser) throw new Error('Entre com Google para continuar.');
    const idToken=await auth.currentUser.getIdToken();
    const response=await fetch('/api/lab-control',{method:'POST',cache:'no-store',
      headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},
      body:JSON.stringify({action,...extra})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||'Não foi possível autorizar a operação.');
    return data;
  };
  const login=async()=>{setError('');try{await signInWithPopup(auth,new GoogleAuthProvider())}
    catch(e){if(e.code!=='auth/popup-closed-by-user') setError(e.code==='auth/unauthorized-domain'?'Domínio não autorizado pelo Firebase. Abra jeltops.vercel.app.':'Falha de login ('+(e.code||'desconhecida')+'). Abra o domínio principal no navegador.')}};
  const generate=async()=>{
    setBusy(true);setError('');
    try{const data=await authorized('issue_code');setCode('');setIssuedCode(data.code);setExpiresAt(data.expiresAtMs)}
    catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const start=async()=>{
    if(!/^\d{6}$/.test(code)){setError('Informe o código de seis dígitos.');return}
    setBusy(true);setError('');
    try{
      const run=await authorized('start',{code});
      if (!mounted.current) return;
      onRunStarted(run.runId);
      setIssuedCode('');setCode('');setExpiresAt(0);setSelected(null);
      timers.current.forEach(clearTimeout);
      const observe = async phase => {
        try {
          const response = await fetch('/api/lab-observe', {
            method:'POST', cache:'no-store',
            headers:{'Content-Type':'application/json','x-lab-observation-token':run.observationToken},
            body:JSON.stringify({runId:run.runId, phase})
          });
          const data = await response.json().catch(()=>({}));
          if (!response.ok) throw new Error(data.error || 'Medição independente indisponível.');
          setReport(data);
          return data.observedChecks.some(sample => sample.phase === phase && !sample.error);
        } catch(e) {
          setError('Verificação: '+e.message);
          return false;
        }
      };
      const remaining = Math.max(0, run.endsAtMs - run.serverNowMs);
      timers.current = [
        setTimeout(async () => {
          const recovered = await observe('recovery');
          await refresh();
          if (!recovered && mounted.current) await observe('recovery');
        }, remaining + 750)
      ];
      void refresh();
      const detected = await observe('outage');
      if (!detected && mounted.current && remaining > 8000) await observe('outage');
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const observed=[...(report.observedChecks||[])].sort((a,b)=>(a.observedAtMs||0)-(b.observedAtMs||0));
  const events=[...(report.simulatedEvents||[]),...observed].sort((a,b)=>(b.observedAtMs||Date.parse(b.timestamp)||0)-(a.observedAtMs||Date.parse(a.timestamp)||0));
  const last=observed[observed.length-1]||null;
  const chosen=selected ? observed.find(x=>x.id===selected)||last : last;
  const valid=chosen && (chosen.statusCode===200||chosen.statusCode===503) && !chosen.error;
  const status = valid ? chosen.statusCode : null;
  const pill = status === 503 ? 'Indisponível' : status === 200 ? 'Disponível' :
    chosen ? 'Inconclusivo' : 'Aguardando medição';
  const observationTitle = valid ? phaseLabels[chosen.phase] || 'Resposta confirmada' :
    chosen?.statusCode ? 'Resposta inesperada — HTTP ' + chosen.statusCode :
    chosen ? 'Medição sem resposta HTTP' : 'Sem evidência HTTP';
  const observationNote = valid ? 'O monitor recebeu HTTP ' + status + ' do serviço experimental.' :
    chosen ? 'Esta verificação não confirmou o estado esperado do serviço experimental.' :
    'Inicie o experimento para coletar uma resposta independente.';
  const isDown=service?.status==='DOWN';
  const raw=chosen ? JSON.stringify({target:'JeltOps Laboratory',method:'GET',path:'/api/lab-target',
    status:chosen.status,statusCode:chosen.statusCode,latencyMs:chosen.latencyMs,
    observedAt:chosen.observedAtMs?new Date(chosen.observedAtMs).toISOString():null,
    error:chosen.error||null,response:chosen.responseJson||null},null,2) : '';
  const controls = (
    <section className="lab-control">
      <div className="lab-section-header"><h3>Controle do experimento</h3><span>Somente apresentadores</span></div>
      {!user?<button type="button" className="lab-primary" onClick={login}>Entrar com Google</button>:<>
        <p className="lab-account">{user.email}</p>
        <button type="button" className="lab-secondary" disabled={busy||isDown} onClick={generate}>{busy?'Aguarde…':'Gerar código temporário'}</button>
        {issuedCode&&<p className="lab-issued" role="status">Seu código: <strong>{issuedCode}</strong> · válido por 5 minutos</p>}
        <label className="lab-access-label" htmlFor="lab-code">Código de confirmação</label>
        <input id="lab-code" className="lab-access-input" value={code} type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
          placeholder="000000" onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}/>
        <button type="button" className="lab-primary" onClick={start} disabled={busy||isDown||!service||!issuedCode||Date.now()>expiresAt}>
          {busy?'Preparando…':'Provocar falha por 30 segundos'}
        </button>
      </>}
      {demoRunId && <button type="button" className="lab-secondary" onClick={onShowDemo}>Acompanhar na Visão geral</button>}
      {error&&<div className="lab-error" role="alert">{error}</div>}
      <p className="lab-subnote">Apenas /api/lab-target é afetado. Mantenha o JeltOps aberto durante as verificações.</p>
    </section>
  );
  return <section className="lab-apple" aria-label="Laboratório HTTP JeltOps">
    <header className="lab-apple-head">
      <div className="lab-overline">JELTOPS / LABORATÓRIO</div>
      <h2>Disponibilidade<span>.</span></h2>
      <p>Uma falha controlada. Evidências reais.</p>
    </header>

    <article className="lab-hero">
      <div className="lab-hero-top">
        <span className="lab-eyebrow">{chosen && chosen !== last ? 'MEDIÇÃO INDEPENDENTE SELECIONADA' : 'ÚLTIMA MEDIÇÃO INDEPENDENTE'}</span>
        <span className={'lab-pill '+(status===503?'lab-bad':status===200?'lab-good':'')}>{pill}</span>
      </div>
      <div className="lab-hero-main">
        <span className="lab-hero-code">{chosen?.statusCode || '—'}</span>
        <strong>{observationTitle}</strong>
        <p>{observationNote}</p>
      </div>
      <div className="lab-hero-stats">
        <div><small>LATÊNCIA</small><strong>{chosen?number(chosen.latencyMs):'—'}</strong></div>
        <div><small>VERIFICADO ÀS</small><strong>{chosen?clock(chosen.observedAtMs):'—'}</strong></div>
      </div>
    </article>

    <section className="lab-flow" aria-label="Etapas do experimento">
      <div className="lab-section-header"><h3>Evolução do teste</h3>
        <span className={isDown?'lab-countdown':''}>{isDown?<><strong>{seconds}s</strong> restantes</>:'Serviço '+(service?'operacional':'não consultado')}</span>
      </div>
      <div className="lab-flow-rail">
        <div><span className="lab-step-dot"/><strong>Normal</strong><small>200</small></div>
        <div className={isDown?'lab-step-active':''}><span className="lab-step-dot"/><strong>Falha</strong><small>503 · 30s</small></div>
        <div className={!isDown&&service?.phase==='RECOVERED'?'lab-step-active':''}><span className="lab-step-dot"/><strong>Recuperação</strong><small>200</small></div>
      </div>
      <p className="lab-subnote">Estado provocado: HTTP {service?.httpCode??'—'}. A medição acima é independente deste estado.</p>
    </section>

    {compact && controls}
    <section className="lab-evidence">
      <button className="lab-evidence-trigger" type="button" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(x=>!x)}>
        <span className="lab-evidence-icon">{'{ }'}</span><span><strong>Detalhes da requisição</strong><small>JSON da medição · HTTP</small></span>
        <span className="lab-chevron">{detailsOpen?'⌃':'⌄'}</span>
      </button>
      {detailsOpen&&<div className="lab-evidence-content">
        {observed.length>1&&<label className="lab-access-label" htmlFor="lab-sample">Medição</label>}
        {observed.length>1&&<select id="lab-sample" className="lab-access-input" value={chosen?.id||''} onChange={e=>setSelected(e.target.value)}>
          {observed.map(x=><option value={x.id} key={x.id}>HTTP {x.statusCode} · {clock(x.observedAtMs)} · {x.phase}</option>)}
        </select>}
        {chosen?<><div className="lab-code-head"><span>Resposta HTTP observada</span><button type="button" onClick={()=>navigator.clipboard?.writeText(raw)}>Copiar</button></div>
          <pre className="lab-code">{raw}</pre><p className="lab-subnote">Campos exibidos apenas quando coletados pelo servidor; medições não confirmadas não contam como falha detectada.</p></>
          :<p className="lab-subnote">Nenhuma medição HTTP independente registrada nesta execução.</p>}
      </div>}
    </section>

    {!compact && controls}

    <section className="lab-history">
      <div className="lab-section-header"><h3>Registro do experimento</h3><span>{events.length} eventos</span></div>
      {events.length===0?<p className="lab-subnote">Nenhum evento registrado nesta execução.</p>:
      <ol>{events.map(item=><li key={item.kind+'-'+item.id}>
        <span className={'lab-event-mark '+(item.kind==='independent-http-observation'?'lab-observed':'')}/>
        <div><strong>{labelFor(item)}</strong><small>HTTP {item.statusCode||'—'} · {clock(item.observedAtMs||item.timestamp)} {item.error?'· '+item.error:''}</small></div>
        <span className="lab-event-type">{item.kind==='independent-http-observation'?'Observado':'Provocado'}</span>
      </li>)}</ol>}
      <p className="lab-subnote">Eventos provocados não comprovam detecção. Somente verificações HTTP independentes são evidências observadas.</p>
    </section>
  </section>;
}
