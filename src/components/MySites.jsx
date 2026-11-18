import CheckHistory from './CheckHistory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { auth } from '../firebaseConfig';
import {monitorRequest as request, roleLabels, activityLabels} from '../monitorAccount';
import MonitorTeam from './MonitorTeam';
import AccountConfirm from './AccountConfirm';
import './MySites.css';

const MAX = 3;
const COMPACT_WIDTH = '(max-width: 640px)';
const statusText = {up:'Disponível',down:'Indisponível',unknown:'Inconclusivo',paused:'Pausado',waiting:'Aguardando checagem'};
const DEFAULT_METRICS = ['status','latency','success'];
const METRIC_LABELS = { status:'Último estado',latency:'Latência média',success:'Amostras positivas',
  http:'Código HTTP',lastCheck:'Último registro',sampleCount:'Respostas HTTP' };
const time = v => v ? new Date(v).toLocaleString('pt-BR') : 'Aguardando';
const shortTime = v => v ? new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
const latency = v => Number.isFinite(Number(v)) ? Math.round(Number(v))+' ms' : '—';
const classification = s => !s || !Number(s.statusCode) ? 'unknown' : s.status === 'UP' ? 'up' : s.status === 'DOWN' ? 'down' : 'unknown';
const tooltipStyle={borderRadius:12,border:'1px solid var(--border-color)',background:'var(--card-bg)',color:'var(--text-color)',fontSize:12};

export default function MySites() {
  const [compact,setCompact] = useState(() => window.matchMedia(COMPACT_WIDTH).matches);
  const [detailsOpen,setDetailsOpen] = useState(false);
  const [checkingSite,setCheckingSite] = useState('');
  const [siteToPause,setSiteToPause] = useState(null);
  const [activityBySite,setActivityBySite] = useState({});
  const [siteToRemove,setSiteToRemove] = useState(null);
  const detailHeading = useRef(null);
  const teamHeading = useRef(null);
  const teamButton = useRef(null);
  const restoreTeamFocus = useRef(false);
  const [teamSiteId, setTeamSiteId] = useState('');
  const compactDetailsButton = useRef(null);
  const [user,setUser] = useState(undefined);
  const [sites,setSites] = useState([]);
  const [samplesBySite,setSamplesBySite] = useState({});
  const [overviewCount,setOverviewCount] = useState(24);
  const [selected,setSelected] = useState('');
  const [name,setName] = useState('');
  const [url,setUrl] = useState('');
  const [formOpen,setFormOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [samplesLoading,setSamplesLoading] = useState(false);
  const [overviewLoading,setOverviewLoading] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [metricEditor,setMetricEditor] = useState(false);
  const [sampleWindow,setSampleWindow] = useState(24);
  const [schedulerAt,setSchedulerAt] = useState(null);
  const [schedulerPreviousAt,setSchedulerPreviousAt] = useState(null);
  const sampleRequestId=useRef(0);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_WIDTH);
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (compact && detailsOpen) detailHeading.current?.focus();
  }, [compact, detailsOpen, selected]);

  useEffect(()=>onAuthStateChanged(auth,setUser,()=>setUser(null)),[]);
  const load=useCallback(async(showLoading=false)=>{
    if(!auth.currentUser)return;
    if(showLoading)setLoading(true);
    try{
      const result=await request();
      setSites(result.sites||[]);
      setSchedulerAt(Number.isFinite(result.schedulerLastAtMs)?result.schedulerLastAtMs:null);
      setSchedulerPreviousAt(Number.isFinite(result.schedulerPreviousAtMs)?result.schedulerPreviousAtMs:null);
      setError('');
    }catch(e){setError(e.message)}finally{if(showLoading)setLoading(false)}
  },[request]);
  useEffect(()=>{
    if(!user){setSites([]);setSamplesBySite({});setActivityBySite({});setSelected('');setDetailsOpen(false);setTeamSiteId('');return}
    load(true);
    const timer=setInterval(()=>load(false),60000);
    const refreshTeam=()=>load(false);
    window.addEventListener('jeltops-team-change',refreshTeam);
    return()=>{
      clearInterval(timer);
      window.removeEventListener('jeltops-team-change',refreshTeam);
    };
  },[user,load]);
  useEffect(()=>{
    setSelected(prev=>sites.some(s=>s.id===prev)?prev:(sites[0]?.id||''));
  },[sites]);
  const activeSite=useMemo(()=>sites.find(s=>s.id===selected)||null,[sites,selected]);
  const teamSite = user && sites.find(site=>site.id===teamSiteId);
  useEffect(()=>{
    if(teamSiteId && !teamSite){setTeamSiteId('');return}
    if(teamSiteId)teamHeading.current?.focus();
    else if(restoreTeamFocus.current){
      restoreTeamFocus.current=false;
      teamButton.current?.focus();
    }
  },[teamSiteId,teamSite?.id]);
  const closeTeam = () => {
    restoreTeamFocus.current=true;
    setTeamSiteId('');
  };
  const samples=samplesBySite[selected]||[];
  useEffect(()=>{setMetricEditor(false);setSampleWindow(24)},[selected]);
  const ids=sites.map(site=>site.id).join(',');
  const fetchAllSamples=useCallback(async()=>{
    if(!auth.currentUser||!ids){setSamplesBySite({});return}
    const requestId=++sampleRequestId.current;
    setOverviewLoading(true);
    try{
      const entries=await Promise.all(ids.split(',').map(async id=>{
        const result=await request('/api/meus-sites?id='+encodeURIComponent(id));
        return [id,result];
      }));
      if(sampleRequestId.current===requestId) {
        setSamplesBySite(Object.fromEntries(entries.map(([id,result])=>[id,result.samples||[]])));
        setActivityBySite(Object.fromEntries(entries.map(([id,result])=>[id,result.activity||[]])));
      }
    }catch(e){if(sampleRequestId.current===requestId)setError(e.message)}
    finally{if(sampleRequestId.current===requestId){setOverviewLoading(false);setSamplesLoading(false)}}
  },[ids,request]);
  useEffect(()=>{
    if(!user||!ids)return;
    fetchAllSamples();
    const timer=setInterval(fetchAllSamples,60_000);
    return()=>{sampleRequestId.current++;clearInterval(timer)};
  },[user,ids,fetchAllSamples]);

  const login=async()=>{
    setError('');
    try{await signInWithPopup(auth,new GoogleAuthProvider())}
    catch(e){
      if(e.code==='auth/popup-closed-by-user')return;
      const messages={
        'auth/unauthorized-domain':'Abra jeltops.vercel.app: domínio não autorizado no Firebase.',
        'auth/operation-not-allowed':'Login com Google desativado no Firebase.',
        'auth/popup-blocked':'Permita popups ou abra o JeltOps diretamente no Safari/Chrome.',
        'auth/operation-not-supported-in-this-environment':'Abra o JeltOps diretamente no Safari ou Chrome.'
      };
      setError(messages[e.code]||'Erro de autenticação ('+(e.code||'desconhecido')+').');
    }
  };
  const mutate=async(path,options,success)=>{
    setBusy(true);setError('');setNotice('');
    try{await request(path,options);setNotice(success);await load();return true}
    catch(e){setError(e.message);return false}finally{setBusy(false)}
  };
  const create=async(e)=>{
    e.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      const result=await request('/api/meus-sites',{method:'POST',body:JSON.stringify({name,url})});
      setName('');setUrl('');setFormOpen(false);setSelected(result.site.id);
      setNotice(result.site.name+' foi cadastrado. A primeira checagem aparece na lista e no histórico.');
      await load();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const toggle=async site=>{
    const ok = await mutate('/api/meus-sites?id='+encodeURIComponent(site.id),
    {method:'PATCH',body:JSON.stringify({action:'toggle',enabled:!site.enabled})},site.enabled?'Monitoramento pausado.':'Monitoramento ativado.');
    if(ok) {
      fetchAllSamples();
      window.dispatchEvent(new Event('jeltops-notifications-change'));
    }
  };
  const requestToggle=site=>site.enabled?setSiteToPause(site):toggle(site);
  const remove=async(site)=>{
    const ok=await mutate('/api/meus-sites?id='+encodeURIComponent(site.id),{method:'DELETE'},'Monitoramento excluído.');
    if(ok&&selected===site.id){setSelected('');setDetailsOpen(false);}
  };
  const checkNow=async(site=activeSite)=>{
    if(!site?.enabled||site.role==='viewer'||busy)return;
    setCheckingSite(site.id);setBusy(true);setError('');setNotice('');
    try{
      const {check}=await request('/api/meus-sites?id='+encodeURIComponent(site.id),
        {method:'POST',body:JSON.stringify({action:'check'})});
      await fetchAllSamples();
      const result = check?.statusCode ? 'HTTP '+check.statusCode : 'Sem resposta HTTP';
      setNotice(site.name+' · '+result+'. Consulte os detalhes para ver a amostra no histórico.');
    }catch(e){setError(site.name+': '+e.message)}finally{setBusy(false);setCheckingSite('')}
  };
  const openDetails = (site, trigger) => {
    compactDetailsButton.current = trigger;
    setSelected(site.id);
    setDetailsOpen(true);
  };
  const closeDetails = () => {
    setDetailsOpen(false);
    compactDetailsButton.current?.focus();
  };
  const configure=async(metric)=>{
    if(!activeSite)return;
    const current=activeSite.metrics||DEFAULT_METRICS;
    const next=current.includes(metric)?current.filter(x=>x!==metric):[...current,metric];
    if(!next.length){setError('Mantenha pelo menos um indicador.');return}
    const ok=await mutate('/api/meus-sites?id='+encodeURIComponent(activeSite.id),
      {method:'PATCH',body:JSON.stringify({action:'configure',metrics:next})},'Preferências salvas.');
    if(ok)setMetricEditor(true);
  };

  // Executive analytics use only persisted private samples and never claim continuous uptime.
  const allRecords=useMemo(()=>sites.flatMap(site=>(samplesBySite[site.id]||[]).map(sample=>({
    ...sample,siteId:site.id,siteName:site.name,monitorEnabled:site.enabled
  }))).sort((a,b)=>Date.parse(b.timestamp||0)-Date.parse(a.timestamp||0)),[sites,samplesBySite]);
  const comparable=allRecords.filter(s=>classification(s)!=='unknown');
  const positives=comparable.filter(s=>classification(s)==='up').length;
  const failureSamples=comparable.filter(s=>classification(s)==='down').length;
  const overviewRate=comparable.length?(positives/comparable.length*100).toFixed(1)+'%':'—';
  const overviewLatency=comparable.length?latency(comparable.reduce((n,s)=>n+Number(s.latencyMs||0),0)/comparable.length):'—';
  const overviewRecent=useMemo(()=>allRecords.slice(0,overviewCount).reverse(),[allRecords,overviewCount]);
  const timeline=useMemo(()=>{
    let up=0,total=0;
    return overviewRecent.map((s,i)=>{
      const cls=classification(s);
      if(cls!=='unknown'){total++;if(cls==='up')up++}
      return {index:i+1,label:shortTime(s.timestamp),site:s.siteName,
        positive:cls==='unknown'?null:cls==='up'?100:0,
        runningRate:total?Number((100*up/total).toFixed(1)):null,
        latency:cls==='unknown'?null:Number(s.latencyMs),
        code:s.statusCode};
    });
  },[overviewRecent]);
  const incidents=useMemo(()=>sites.flatMap(site=>{
    const rows=(samplesBySite[site.id]||[]).slice().reverse();
    let previousStatus='unknown';
    return rows.flatMap(s=>{
      const current=classification(s);
      const failed=current==='down'&&previousStatus!=='down';
      const recovered=current==='up'&&previousStatus==='down';
      if(current!=='unknown')previousStatus=current;
      if(!failed&&!recovered)return [];
      return [{...s,siteId:site.id,siteName:site.name,kind:recovered?'recovery':'failure'}];
    });
  }).sort((a,b)=>Date.parse(b.timestamp||0)-Date.parse(a.timestamp||0)),[sites,samplesBySite]);
  const siteSummary=site=>{
    const rows=samplesBySite[site.id]||[];
    const valid=rows.filter(s=>classification(s)!=='unknown');
    const passed=valid.filter(s=>classification(s)==='up');
    return {latest:rows[0]||null,valid:valid.length,
      rate:valid.length?(100*passed.length/valid.length).toFixed(1)+'%':'—',
      latency:valid.length?latency(valid.reduce((acc,s)=>acc+Number(s.latencyMs||0),0)/valid.length):'—'};
  };
  const activeCount=sites.filter(s=>s.enabled).length;
  const ownedCount=sites.filter(s=>!s.role||s.role==='owner').length;
  const latest=samples[0]||null;
  const latestClass=classification(latest);
  const measured=samples.filter(s=>classification(s)!=='unknown');
  const up=measured.filter(s=>s.status==='UP').length;
  const avg=measured.length?latency(measured.reduce((a,s)=>a+Number(s.latencyMs||0),0)/measured.length):'—';
  const rate=measured.length?((up/measured.length)*100).toFixed(1)+'%':'—';
  const metrics={
    status:{title:'ÚLTIMO ESTADO',value:!latest?statusText.waiting:statusText[latestClass],note:!activeSite?.enabled?'Monitoramento pausado':latest?.statusCode?'HTTP '+latest.statusCode:'Sem resposta confirmada'},
    latency:{title:'LATÊNCIA MÉDIA',value:avg,note:'Nas últimas '+measured.length+' respostas registradas'},
    success:{title:'AMOSTRAS POSITIVAS',value:rate,note:'Não equivale ao uptime contínuo'},
    http:{title:'ÚLTIMO CÓDIGO HTTP',value:latest?.statusCode||'—',note:latest?.error||'Última amostra salva'},
    lastCheck:{title:'ÚLTIMO REGISTRO',value:shortTime(latest?.timestamp),note:latest?new Date(latest.timestamp).toLocaleDateString('pt-BR'):'Aguardando'},
    sampleCount:{title:'RESPOSTAS HTTP',value:measured.length,note:'Entre '+samples.length+' registros consultados'}
  };
  const data=useMemo(()=>samples.slice(0,sampleWindow).filter(s=>classification(s)!=='unknown')
    .slice().reverse().map((s,i)=>({id:s.id,time:shortTime(s.timestamp),latency:Number(s.latencyMs),code:s.statusCode,index:i+1})),[samples,sampleWindow]);
  const loadHistory = useCallback((params, signal) => {
    params.set('view', 'history');
    params.set('id', selected);
    return request('/api/meus-sites?' + params, { signal });
  }, [selected, user?.uid]);
  const schedulerGapMs = schedulerAt && schedulerPreviousAt ? schedulerAt - schedulerPreviousAt : null;
  const schedulerGap = schedulerGapMs > 0
    ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(schedulerGapMs / 60000) + ' min'
    : 'Aguardando duas execuções';
  const eventsPanel = <section className="mine-recent-events" aria-label="Eventos do monitoramento">
            <div className="mine-panel-heading"><div><h4>Eventos recentes</h4><p>Falhas e recuperações observadas</p></div></div>
            {incidents.length===0?<div className="mine-events-empty">Nenhuma falha ou recuperação nas amostras consultadas.</div>:
              <ol>{incidents.slice(0,5).map(e=><li key={e.siteId+'-'+e.id}>
                <span className={'mine-event-dot '+e.kind} aria-hidden="true"/><div><strong>{e.siteName} · HTTP {e.statusCode}</strong>
                <small>{e.kind==='recovery'?'Recuperação observada':'Falha observada'}</small></div><time>{time(e.timestamp)}</time></li>)}</ol>}
            </section>;
  if (teamSite) return <section className="account-page monitor-team-page" aria-labelledby="team-page-title">
    <button className="mine-quiet account-back" type="button" onClick={closeTeam}>‹ Voltar ao monitor</button>
    <header className="account-team-header">
      <h2 id="team-page-title" ref={teamHeading} tabIndex={-1}>Equipe</h2>
      <p>{teamSite.name} · {roleLabels[teamSite.role]}</p>
    </header>
    <MonitorTeam key={teamSite.id} site={teamSite} onChanged={async action=>{
      await load();
      if(action==='leave_team')setNotice('Você saiu da equipe de '+teamSite.name+'.');
    }}/>
  </section>;

  return <section className="mine-page" aria-label="Meus sites monitorados">
    <header className="mine-head">
      <div><span className="eyebrow">JELTOPS / ÁREA PARTICULAR</span><h2>Meus sites<span>.</span></h2>
        <p>Visibilidade sobre cada serviço, da disponibilidade ao histórico técnico.</p></div>
      {user&&<button className="mine-quiet mine-signout" type="button" onClick={()=>signOut(auth)}>Sair</button>}
    </header>
    {user===undefined?<div className="mine-empty">Verificando sua sessão…</div>:!user?
      <section className="mine-login"><span className="mine-login-icon">◎</span><h3>Seus serviços, em um só lugar.</h3>
        <p>Entre com Google para acompanhar até três sites HTTPS públicos, com histórico e indicadores particulares.</p>
        <button className="mine-primary" type="button" onClick={login}>Entrar com Google</button></section>:
      <>
        {!compact&&sites.length>0&&<section className="mine-executive" aria-label="Visão executiva dos seus sites">
          <div className="mine-executive-heading">
            <div><span className="eyebrow">CENTRAL PARTICULAR / VISÃO EXECUTIVA</span>
              <h3>O que aconteceu com seus serviços?</h3>
              <p>Resultados das verificações salvas, sem estimar disponibilidade contínua.</p></div>
            <span className="mine-data-scope">{overviewLoading?'Atualizando amostras…':allRecords.length+' registros recentes'}</span>
          </div>
          <div className="mine-kpi-grid">
            <article><span>AMOSTRAS POSITIVAS</span><strong>{overviewRate}</strong><small>{comparable.length} respostas HTTP válidas</small></article>
            <article><span>MONITORES ATIVOS</span><strong>{activeCount}<small> / {sites.length}</small></strong><small>{sites.length-activeCount} pausado(s)</small></article>
            <article><span>LATÊNCIA MÉDIA</span><strong>{overviewLatency}</strong><small>Entre respostas salvas</small></article>
            <article><span>FALHAS OBSERVADAS</span><strong>{failureSamples}</strong><small>{incidents.length} início(s) de falha registrados</small></article>
          </div>
          <div className="mine-executive-charts">
            <section className="mine-overview-chart" aria-label="Tendência das respostas HTTP">
              <div className="mine-panel-heading"><div><h4>Disponibilidade observada</h4>
                <p>Taxa acumulada de respostas positivas nas amostras selecionadas</p></div>
                <label>Janela <select value={overviewCount} onChange={e=>setOverviewCount(Number(e.target.value))}>
                  <option value={12}>12 amostras</option><option value={24}>24 amostras</option><option value={40}>40 amostras</option>
                </select></label></div>
              {timeline.filter(d=>d.runningRate!==null).length<2?
                <div className="mine-chart-empty">Aguardando duas verificações HTTP para traçar a tendência.</div>:
                <div className="mine-overview-plot"><ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline} margin={{top:12,right:8,left:-24,bottom:0}}>
                    <defs><linearGradient id="mine-success-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#85ac35" stopOpacity={0.27}/><stop offset="100%" stopColor="#85ac35" stopOpacity={0.01}/></linearGradient></defs>
                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeDasharray="3 6"/>
                    <XAxis dataKey="index" tick={{fontSize:10,fill:'var(--muted-text)'}} tickLine={false} axisLine={false} minTickGap={20}/>
                    <YAxis domain={[0,100]} tick={{fontSize:10,fill:'var(--muted-text)'}} tickLine={false} axisLine={false} unit="%"/>
                    <Tooltip contentStyle={tooltipStyle} formatter={v=>[v+'%','Taxa acumulada']} labelFormatter={(_,items)=>items?.[0]?.payload?items[0].payload.site+' · '+items[0].payload.label:'Verificação'}/>
                    <Area type="monotone" dataKey="runningRate" connectNulls stroke="#86ad36" strokeWidth={2.4} fill="url(#mine-success-fill)" isAnimationActive={false}/>
                  </AreaChart></ResponsiveContainer></div>}
              <p className="mine-footnote">Não é uptime por tempo. Cada ponto representa a taxa calculada sobre as respostas disponíveis na janela.</p>
            </section>
            <section className="mine-overview-chart" aria-label="Latências observadas">
              <div className="mine-panel-heading"><div><h4>Tempo de resposta</h4><p>Latência por verificação salva</p></div><span>ms</span></div>
              {timeline.filter(d=>d.latency!==null).length<2?
                <div className="mine-chart-empty">Sem amostras suficientes para comparar latências.</div>:
                <div className="mine-overview-plot"><ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline} margin={{top:12,right:10,left:-12,bottom:0}}>
                    <defs><linearGradient id="mine-response-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#70a9e9" stopOpacity={0.25}/><stop offset="100%" stopColor="#70a9e9" stopOpacity={0.015}/></linearGradient></defs>
                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeDasharray="3 6"/>
                    <XAxis dataKey="index" tick={{fontSize:10,fill:'var(--muted-text)'}} tickLine={false} axisLine={false} minTickGap={20}/>
                    <YAxis tick={{fontSize:10,fill:'var(--muted-text)'}} tickLine={false} axisLine={false} width={44} unit=" ms"/>
                    <Tooltip contentStyle={tooltipStyle} formatter={v=>[v+' ms','Latência']} labelFormatter={(_,items)=>items?.[0]?.payload?items[0].payload.site+' · '+items[0].payload.label:'Verificação'}/>
                    <Area type="monotone" dataKey="latency" connectNulls={false} stroke="#70a9e9" strokeWidth={2.4} fill="url(#mine-response-fill)" isAnimationActive={false}/>
                  </AreaChart></ResponsiveContainer></div>}
              <p className="mine-footnote">Falhas sem resposta HTTP não são convertidas em latência zero.</p>
            </section>
          </div>
          <section className="mine-services-overview" aria-label="Comparação de serviços">
            <div className="mine-panel-heading"><div><h4>Visão dos serviços</h4><p>Última resposta e médias por monitor</p></div>
              <span>{ownedCount} de {MAX} próprios</span></div>
            <div className="mine-table-scroll"><table className="mine-overview-table">
              <thead><tr><th>Serviço</th><th>Monitor</th><th>Amostras +</th><th>Latência</th><th>Último HTTP</th><th>Último registro</th></tr></thead>
              <tbody>{sites.map(site=>{const summary=siteSummary(site);return <tr key={site.id} className={selected===site.id?'is-current':''}>
                <td><button type="button" onClick={()=>setSelected(site.id)}>{site.name} <span>›</span></button><small>{site.url}{site.memberCount>1?' · '+site.memberCount+' pessoas':''}</small></td>
                <td data-label="Monitor"><span className={'mine-table-status '+(site.enabled?'is-on':'')}>{site.enabled?'Ativo':'Pausado'}</span></td>
                <td data-label="Amostras +">{summary.rate}</td><td data-label="Latência">{summary.latency}</td>
                <td data-label="Último HTTP">{Number(summary.latest?.statusCode)>0?'HTTP '+summary.latest.statusCode:'—'}</td>
                <td data-label="Último registro">{shortTime(summary.latest?.timestamp)}</td></tr>})}</tbody>
            </table></div>
          </section>
          {eventsPanel}
        </section>}
        <div className="mine-section-title"><div><h3>{compact?'Seus monitores':'Gerenciar monitores'}</h3>
          {sites.length>0&&<p>{compact?ownedCount+' de '+MAX+' próprios':user.email+' · monitoramento particular'}</p>}</div>
          <button type="button" className="mine-primary" disabled={busy||(!formOpen&&ownedCount>=MAX)} aria-expanded={formOpen} onClick={()=>setFormOpen(x=>!x)}>
            {formOpen?'Fechar':sites.length===0&&!loading?'Adicionar meu primeiro site':'+ Adicionar'}
          </button></div>
        {formOpen&&<form className="mine-form" onSubmit={create}>
          <h4>Novo monitoramento</h4>
          <label htmlFor="mine-name">Nome do site</label>
          <input id="mine-name" value={name} minLength={3} maxLength={60} required placeholder="Nome do serviço" onChange={e=>setName(e.target.value)}/>
          <label htmlFor="mine-url">Endereço HTTPS público</label>
          <input id="mine-url" type="url" inputMode="url" autoCapitalize="none" required value={url} placeholder="https://exemplo.com" onChange={e=>setUrl(e.target.value)}/>
          <p>Apenas a origem HTTPS pública, sem caminhos, parâmetros ou portas personalizadas.</p>
          <button className="mine-primary" type="submit" disabled={busy||name.trim().length<3}>{busy?'Salvando…':'Cadastrar site'}</button>
        </form>}
        <div className="mine-feedback">
          {(notice||checkingSite)&&<p role="status">{checkingSite?'Verificando '+sites.find(site=>site.id===checkingSite)?.name+'…':notice}</p>}
          {error&&<p className="mine-inline-error" role="alert">{error}</p>}
        </div>
        {loading?<div className="mine-empty">Carregando monitores…</div>:sites.length===0?
          !error&&!formOpen&&<div className="mine-empty">Cadastre um site para acompanhar a disponibilidade e o tempo de resposta.</div>:
          compact?<ul className="mine-compact-list">
            {sites.map(site=>{
              const recent=samplesBySite[site.id]?.[0];
              const state=!site.enabled?'paused':!recent?'waiting':classification(recent);
              return <li key={site.id}>
                <button className="mine-compact-site" type="button" aria-expanded={detailsOpen&&selected===site.id}
                  aria-controls={detailsOpen&&selected===site.id?'mine-monitor-detail':undefined}
                  onClick={event=>openDetails(site,event.currentTarget)}>
                  <span className="mine-compact-name">
                    <strong>{site.name}</strong>
                    <small>{recent ? (recent.statusCode?'HTTP '+recent.statusCode:'Sem resposta HTTP')+' · '+shortTime(recent.timestamp) : 'Sem registros'}{site.memberCount>1?' · '+site.memberCount+' pessoas':''}</small>
                  </span>
                  <span className={'mine-status-pill is-'+state}>{statusText[state]}</span>
                  <span aria-hidden="true">›</span>
                </button>
                <button className="mine-quiet mine-compact-check" type="button" disabled={busy||!site.enabled||site.role==='viewer'}
                  aria-label={'Verificar agora: '+site.name} title="Verificar agora" onClick={()=>checkNow(site)}>↻</button>
              </li>
            })}
          </ul>:<div className="mine-services" role="list">
            {sites.map(site=><article key={site.id} className={'mine-service '+(selected===site.id?'is-selected':'')} role="listitem">
              <button className="mine-service-focus" aria-current={selected===site.id?'true':undefined}
                type="button" onClick={()=>setSelected(site.id)}>
                <span className="mine-service-symbol">◎</span>
                <span className="mine-service-identity"><strong>{site.name}</strong><small>{site.url}{site.memberCount>1?' · '+site.memberCount+' pessoas':''}</small>
                  <em className={site.enabled?'is-active':'is-paused'}>{site.enabled?'Monitorando':'Pausado'}</em></span>
                <span className="mine-service-arrow">›</span>
              </button>
              {(!site.role||site.role==='owner')&&<div className="mine-service-actions">
                <button type="button" disabled={busy} onClick={()=>requestToggle(site)}>{site.enabled?'Pausar':'Ativar'}</button>
                <button type="button" className="mine-destructive" disabled={busy} onClick={()=>setSiteToRemove(site)}>Excluir</button>
              </div>}
            </article>)}
          </div>}
        {compact&&sites.length>0&&eventsPanel}
        {activeSite&&(!compact||detailsOpen)&&<section id="mine-monitor-detail" className="mine-detail" aria-label={'Detalhes de '+activeSite.name}>
          <div className="mine-detail-header">
            <div><span className="eyebrow">ANÁLISE INDIVIDUAL / DETALHES DO MONITOR</span><h3 ref={detailHeading} tabIndex={-1}>{activeSite.name}</h3>
              <p>{activeSite.enabled?'Verificações automáticas habilitadas':'Monitoramento pausado · os dados abaixo são históricos'}</p></div>
            <span className={'mine-status-pill '+(!activeSite.enabled?'is-paused':samplesLoading&&!latest?'is-unknown':latestClass==='up'?'is-up':latestClass==='down'?'is-down':'is-unknown')}>
              {!activeSite.enabled?'Pausado':samplesLoading&&!latest?'Carregando':latest?statusText[latestClass]:statusText.waiting}
            </span>
          </div>
          {compact&&<div className="mine-mobile-tools">
            <button className="mine-quiet" type="button" onClick={closeDetails}>Fechar detalhes</button>
            {(!activeSite.role||activeSite.role==='owner')&&<>
              <button className="mine-quiet" type="button" disabled={busy} onClick={()=>requestToggle(activeSite)}>{activeSite.enabled?'Pausar':'Ativar'}</button>
              <button className="mine-quiet mine-destructive" type="button" disabled={busy} onClick={()=>setSiteToRemove(activeSite)}>Excluir</button>
            </>}
          </div>}
          <div className="mine-detail-toolbar">
            <span>Último registro <strong>{time(latest?.timestamp)}</strong></span>
            <button type="button" className="mine-primary" disabled={busy||!activeSite.enabled||activeSite.role==='viewer'} onClick={()=>checkNow()}>
              {checkingSite===activeSite.id?'Verificando…':'↻ Verificar agora'}
            </button>
            {activeSite.role&&<button ref={teamButton} className="mine-quiet monitor-team-entry" type="button"
              onClick={()=>setTeamSiteId(activeSite.id)}
              aria-label={'Equipe de '+activeSite.name+', '+(activeSite.memberCount??1)+' acompanhando'}>
              Equipe <span>{activeSite.memberCount ?? 1}</span> <span aria-hidden="true">›</span>
            </button>}
          </div>

          <div className="mine-metric-title"><h4>Indicadores</h4>
            {(!activeSite.role||activeSite.role==='owner')&&<button type="button" className="mine-quiet" aria-expanded={metricEditor} onClick={()=>setMetricEditor(x=>!x)}>{metricEditor?'Concluir':'Personalizar'}</button>}</div>
          {metricEditor&&<div className="mine-metric-editor"><p>Escolha os indicadores que deseja acompanhar neste serviço.</p>
            <div>{Object.entries(METRIC_LABELS).map(([key,label])=><label key={key}>
              <input type="checkbox" disabled={busy} checked={(activeSite.metrics||DEFAULT_METRICS).includes(key)} onChange={()=>configure(key)}/>{label}
            </label>)}</div></div>}
          <div className="mine-indicator-grid">
            {(activeSite.metrics||DEFAULT_METRICS).map(key=>metrics[key]&&<div key={key} className={'mine-metric-card '+(key==='status'&&latestClass==='down'?'is-alert':'')}>
              <span>{metrics[key].title}</span><strong>{metrics[key].value}</strong><small>{metrics[key].note}</small>
            </div>)}
          </div>
          <section className="mine-chart-panel" aria-label="Gráfico de latência">
            <div className="mine-chart-head"><div><h4>Comportamento da latência</h4><p>Respostas HTTP salvas, em ordem cronológica</p></div>
              <label>Registros <select value={sampleWindow} onChange={e=>setSampleWindow(Number(e.target.value))}>
                <option value={12}>12</option><option value={24}>24</option><option value={40}>40</option>
              </select></label>
            </div>
            {latest&&<p className="mine-footnote">Última checagem: {time(latest.timestamp)} · {latest.statusCode?'HTTP '+latest.statusCode:'Sem resposta HTTP'} · {latency(latest.latencyMs)}. Veja os valores por amostra no histórico abaixo.</p>}
            {data.length<2?<div className="mine-chart-empty">Precisamos de pelo menos duas respostas HTTP registradas para construir o gráfico.</div>:
              <div className="mine-chart" role="img" aria-label="Gráfico de latência das respostas HTTP registradas">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{top:10,right:12,bottom:0,left:-18}}>
                    <defs><linearGradient id="mine-latency-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8fba43" stopOpacity={0.3}/><stop offset="100%" stopColor="#8fba43" stopOpacity={0.01}/>
                    </linearGradient></defs>
                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeDasharray="3 6"/>
                    <XAxis dataKey="time" tick={{fontSize:10,fill:'var(--muted-text)'}} tickLine={false} axisLine={false} minTickGap={24}/>
                    <YAxis tick={{fontSize:10,fill:'var(--muted-text)'}} tickLine={false} axisLine={false} width={48} unit=" ms"/>
                    <Tooltip contentStyle={tooltipStyle} formatter={v=>[v+' ms','Latência']}
                      labelFormatter={(_,items)=>items?.[0]?.payload?'Resposta HTTP '+items[0].payload.code+' · '+items[0].payload.time:'Verificação'}/>
                    <Area type="monotone" dataKey="latency" stroke="#85ac35" strokeWidth={2.5} fill="url(#mine-latency-fill)" dot={data.length<=12?{r:3}:false} isAnimationActive={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>}
            <p className="mine-footnote">O gráfico contém apenas amostras persistidas, não medições contínuas. Pausar um serviço não produz novos pontos.</p>
          </section>
          {activityBySite[selected]?.length>0&&<section className="mine-history" aria-label="Atividade da equipe">
            <div className="mine-history-head"><div><h4>Atividade do monitor</h4></div></div>
            <ol>{activityBySite[selected].map(event=><li key={event.id}>
              <span className="mine-history-bullet"/>
              <div><strong>{activityLabels[event.kind]}</strong><small>{event.actorName || 'Verificação automática'}</small></div>
              <time>{time(event.at)}</time>
            </li>)}</ol>
          </section>}
          <section className="mine-history" aria-label="Histórico técnico do serviço">
            <div className="mine-history-head"><div><h4>Histórico técnico</h4></div></div>
            <CheckHistory key={user.uid + ':' + selected} load={loadHistory} revision={latest?.id}>
              {rows => <ol>{rows.map(sample => <li key={sample.id}>
                <span className={'mine-history-bullet ' + classification(sample)}/>
                <div><strong>{sample.recovered ? 'Recuperado' : classification(sample) === 'up' ? 'Disponível' : classification(sample) === 'down' ? 'Falha HTTP' : 'Inconclusivo'}</strong>
                  <small>{sample.statusCode > 0 ? 'HTTP ' + sample.statusCode : 'Sem resposta HTTP'} · {latency(sample.latencyMs)}{sample.source === 'manual' ? ' · Manual' + (sample.actorName ? ' · Por ' + sample.actorName : '') : ''}{sample.error ? ' · ' + sample.error : ''}</small></div>
                <time dateTime={sample.timestamp}>{time(sample.timestamp)}</time>
              </li>)}</ol>}
            </CheckHistory>
          </section>
          <details className="mine-scheduler">
            <summary>Agendador e limites do monitoramento <span>⌄</span></summary>
            <div className="mine-scheduler-content">
              <p>Última execução: <strong>{schedulerAt?time(schedulerAt):'Não informada'}</strong></p>
              <p>Intervalo entre as duas últimas execuções: <strong>{schedulerGap}</strong></p>
              <p>Em estado estável, uma amostra é salva na primeira execução após 10 minutos. Mudanças de estado ou de código HTTP são salvas na execução que as detectar.</p>
              <p>Os indicadores usam até 40 registros recentes por site. A taxa de amostras positivas descreve as verificações salvas.</p>
            </div>
          </details>
        </section>}
        <p className="mine-footnote mine-bottom-note">As verificações usam requisições HTTPS. Monitoramento pausado não significa que o site esteja indisponível.</p>
      </>}
    {!user&&error&&<div className="mine-error" role="alert">{error}</div>}
    {siteToPause&&<AccountConfirm title={'Pausar '+siteToPause.name+'?'}
      description="As verificações automáticas e manuais serão interrompidas para toda a equipe. O histórico continua disponível."
      actionLabel="Pausar monitor" onCancel={()=>setSiteToPause(null)}
      onConfirm={()=>{setSiteToPause(null);toggle(siteToPause);}}/>}
    {siteToRemove&&<AccountConfirm title={'Excluir '+siteToRemove.name+'?'}
      description="O monitor e seu histórico serão excluídos, inclusive para os membros da equipe."
      actionLabel="Excluir monitor" onCancel={()=>setSiteToRemove(null)}
      onConfirm={()=>{setSiteToRemove(null);remove(siteToRemove);}}/>}
  </section>;
}
