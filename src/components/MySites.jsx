import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { auth } from '../firebaseConfig';
import './MySites.css';

const MAX = 3;
const DEFAULT_METRICS = ['status','latency','success'];
const METRIC_LABELS = { status:'Último estado',latency:'Latência média',success:'Amostras positivas',
  http:'Código HTTP',lastCheck:'Último registro',sampleCount:'Respostas HTTP' };
const time = v => v ? new Date(v).toLocaleString('pt-BR') : 'Aguardando';
const shortTime = v => v ? new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
const latency = v => Number.isFinite(Number(v)) ? Math.round(Number(v))+' ms' : '—';
const classification = s => !s || !Number(s.statusCode) ? 'unknown' : s.status === 'UP' ? 'up' : s.status === 'DOWN' ? 'down' : 'unknown';
const filterSample = (s,f) => f==='all' || classification(s)===f;
const tooltipStyle={borderRadius:12,border:'1px solid var(--border-color)',background:'var(--card-bg)',color:'var(--text-color)',fontSize:12};

export default function MySites() {
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
  const [historyFilter,setHistoryFilter] = useState('all');
  const [sampleWindow,setSampleWindow] = useState(24);
  const [schedulerAt,setSchedulerAt] = useState(null);
  const sampleRequestId=useRef(0);

  useEffect(()=>onAuthStateChanged(auth,setUser,()=>setUser(null)),[]);
  const request=useCallback(async(path='/api/meus-sites',options={})=>{
    const current=auth.currentUser;
    if(!current)throw new Error('Entre com sua conta Google.');
    const token=await current.getIdToken();
    const response=await fetch(path,{...options,cache:'no-store',headers:{
      Accept:'application/json',Authorization:'Bearer '+token,
      ...(options.body?{'Content-Type':'application/json'}:{}),...options.headers
    }});
    const body=await response.json().catch(()=>null);
    if(!response.ok){
      const message=typeof body?.error==='string'?body.error:typeof body?.message==='string'?body.message:'';
      throw new Error(message||(response.status===401?'Sessão expirada. Entre novamente.':'Não foi possível concluir a operação.'));
    }
    return body||{};
  },[]);

  const load=useCallback(async(showLoading=false)=>{
    if(!auth.currentUser)return;
    if(showLoading)setLoading(true);
    try{
      const result=await request();
      setSites(result.sites||[]);
      setSchedulerAt(Number.isFinite(result.schedulerLastAtMs)?result.schedulerLastAtMs:null);
      setError('');
    }catch(e){setError(e.message)}finally{if(showLoading)setLoading(false)}
  },[request]);
  useEffect(()=>{
    if(!user){setSites([]);setSamplesBySite({});setSelected('');return}
    load(true);
    const timer=setInterval(()=>load(false),60000);
    return()=>clearInterval(timer);
  },[user,load]);
  useEffect(()=>{
    setSelected(prev=>sites.some(s=>s.id===prev)?prev:(sites[0]?.id||''));
  },[sites]);
  const activeSite=useMemo(()=>sites.find(s=>s.id===selected)||null,[sites,selected]);
  const samples=samplesBySite[selected]||[];
  useEffect(()=>{setMetricEditor(false);setHistoryFilter('all');setSampleWindow(24)},[selected]);
  const ids=sites.map(site=>site.id).join(',');
  const fetchAllSamples=useCallback(async()=>{
    if(!auth.currentUser||!ids){setSamplesBySite({});return}
    const requestId=++sampleRequestId.current;
    setOverviewLoading(true);
    try{
      const entries=await Promise.all(ids.split(',').map(async id=>{
        const result=await request('/api/meus-sites?id='+encodeURIComponent(id));
        return [id,result.samples||[]];
      }));
      if(sampleRequestId.current===requestId)setSamplesBySite(Object.fromEntries(entries));
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
      setNotice('Site cadastrado. A primeira verificação foi solicitada.');
      await load();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const toggle=site=>mutate('/api/meus-sites?id='+encodeURIComponent(site.id),
    {method:'PATCH',body:JSON.stringify({action:'toggle'})},site.enabled?'Monitoramento pausado.':'Monitoramento ativado.');
  const remove=async(site)=>{
    if(!window.confirm('Excluir '+site.name+' e seu histórico?'))return;
    const ok=await mutate('/api/meus-sites?id='+encodeURIComponent(site.id),{method:'DELETE'},'Monitoramento excluído.');
    if(ok&&selected===site.id)setSelected('');
  };
  const checkNow=async()=>{
    if(!activeSite?.enabled)return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('/api/meus-sites?id='+encodeURIComponent(activeSite.id),
        {method:'POST',body:JSON.stringify({action:'check'})});
      await fetchAllSamples();
      setNotice('Verificação executada. Resultado registrado no histórico.');
    }catch(e){setError(e.message)}finally{setBusy(false)}
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
    return rows.flatMap((s,i)=>{
      if(classification(s)!=='down')return [];
      const previous=rows[i-1];
      // A DOWN sample without a prior stored UP is evidence, not a confirmed transition.
      if(previous && classification(previous)==='down')return [];
      return [{...s,siteId:site.id,siteName:site.name,kind:'failure'}];
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
  const latest=samples[0]||null;
  const latestClass=classification(latest);
  const measured=samples.filter(s=>classification(s)!=='unknown');
  const up=measured.filter(s=>s.status==='UP').length;
  const avg=measured.length?latency(measured.reduce((a,s)=>a+Number(s.latencyMs||0),0)/measured.length):'—';
  const rate=measured.length?((up/measured.length)*100).toFixed(1)+'%':'—';
  const metrics={
    status:{title:'ÚLTIMO ESTADO',value:!latest?'Sem dados':latestClass==='unknown'?'Inconclusivo':latestClass==='up'?'Disponível':'Indisponível',note:!activeSite?.enabled?'Monitoramento pausado':latest?.statusCode?'HTTP '+latest.statusCode:'Sem resposta confirmada'},
    latency:{title:'LATÊNCIA MÉDIA',value:avg,note:'Nas últimas '+measured.length+' respostas registradas'},
    success:{title:'AMOSTRAS POSITIVAS',value:rate,note:'Não equivale ao uptime contínuo'},
    http:{title:'ÚLTIMO CÓDIGO HTTP',value:latest?.statusCode||'—',note:latest?.error||'Última amostra salva'},
    lastCheck:{title:'ÚLTIMO REGISTRO',value:shortTime(latest?.timestamp),note:latest?new Date(latest.timestamp).toLocaleDateString('pt-BR'):'Aguardando'},
    sampleCount:{title:'RESPOSTAS HTTP',value:measured.length,note:'Entre '+samples.length+' registros consultados'}
  };
  const data=useMemo(()=>samples.slice(0,sampleWindow).filter(s=>classification(s)!=='unknown')
    .slice().reverse().map((s,i)=>({id:s.id,time:shortTime(s.timestamp),latency:Number(s.latencyMs),code:s.statusCode,index:i+1})),[samples,sampleWindow]);
  const visibleHistory=useMemo(()=>samples.filter(s=>filterSample(s,historyFilter)).slice(0,30),[samples,historyFilter]);
  const nextAt=schedulerAt?schedulerAt+600000:null;
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
        <section className="mine-executive" aria-label="Visão executiva dos seus sites">
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
              <span>{sites.length} de {MAX} cadastrados</span></div>
            {sites.length===0?<div className="mine-chart-empty">Adicione um serviço para iniciar a comparação.</div>:
            <div className="mine-table-scroll"><table className="mine-overview-table">
              <thead><tr><th>Serviço</th><th>Monitor</th><th>Amostras +</th><th>Latência</th><th>Último HTTP</th><th>Último registro</th></tr></thead>
              <tbody>{sites.map(site=>{const summary=siteSummary(site);return <tr key={site.id} className={selected===site.id?'is-current':''}>
                <td><button type="button" onClick={()=>setSelected(site.id)}>{site.name} <span>›</span></button><small>{site.url}</small></td>
                <td><span className={'mine-table-status '+(site.enabled?'is-on':'')}>{site.enabled?'Ativo':'Pausado'}</span></td>
                <td>{summary.rate}</td><td>{summary.latency}</td>
                <td>{Number(summary.latest?.statusCode)>0?'HTTP '+summary.latest.statusCode:'—'}</td>
                <td>{shortTime(summary.latest?.timestamp)}</td></tr>})}</tbody>
            </table></div>}
          </section>
          <section className="mine-recent-events" aria-label="Eventos de indisponibilidade registrados">
            <div className="mine-panel-heading"><div><h4>Eventos recentes</h4><p>Inícios de falhas identificados nos registros disponíveis</p></div></div>
            {incidents.length===0?<div className="mine-events-empty">Nenhum início de falha encontrado nas amostras consultadas.</div>:
              <ol>{incidents.slice(0,5).map(e=><li key={e.siteId+'-'+e.id}>
                <span className="mine-event-dot"/><div><strong>{e.siteName} · HTTP {e.statusCode}</strong>
                <small>Resposta com falha registrada</small></div><time>{time(e.timestamp)}</time></li>)}</ol>}
          </section>
        </section>
        <div className="mine-section-title"><div><h3>Gerenciar monitores</h3><p>{user.email} · monitoramento particular</p></div>
          <button type="button" className="mine-primary" disabled={busy||sites.length>=MAX} onClick={()=>setFormOpen(x=>!x)}>
            {formOpen?'Fechar':'+ Adicionar'}
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
        {loading?<div className="mine-empty">Carregando monitores…</div>:sites.length===0?<div className="mine-empty">Nenhum serviço cadastrado. Adicione seu primeiro site para começar.</div>:
          <div className="mine-services" role="list">
            {sites.map(site=><article key={site.id} className={'mine-service '+(selected===site.id?'is-selected':'')} role="listitem">
              <button className="mine-service-focus" aria-current={selected===site.id?'true':undefined}
                type="button" onClick={()=>setSelected(site.id)}>
                <span className="mine-service-symbol">◎</span>
                <span className="mine-service-identity"><strong>{site.name}</strong><small>{site.url}</small>
                  <em className={site.enabled?'is-active':'is-paused'}>{site.enabled?'Monitorando':'Pausado'}</em></span>
                <span className="mine-service-arrow">›</span>
              </button>
              <div className="mine-service-actions">
                <button type="button" disabled={busy} onClick={()=>toggle(site)}>{site.enabled?'Pausar':'Ativar'}</button>
                <button type="button" className="mine-destructive" disabled={busy} onClick={()=>remove(site)}>Excluir</button>
              </div>
            </article>)}
          </div>}
        {activeSite&&<section className="mine-detail" aria-label={'Detalhes de '+activeSite.name}>
          <div className="mine-detail-header">
            <div><span className="eyebrow">ANÁLISE INDIVIDUAL / DETALHES DO MONITOR</span><h3>{activeSite.name}</h3>
              <p>{activeSite.enabled?'Verificações automáticas habilitadas':'Monitoramento pausado · os dados abaixo são históricos'}</p></div>
            <span className={'mine-status-pill '+(!activeSite.enabled?'is-paused':samplesLoading&&!latest?'is-unknown':latestClass==='up'?'is-up':latestClass==='down'?'is-down':'is-unknown')}>
              {!activeSite.enabled?'Pausado':samplesLoading&&!latest?'Carregando':latestClass==='up'?'Última resposta OK':latestClass==='down'?'Última resposta com falha':'Sem confirmação'}
            </span>
          </div>
          <div className="mine-detail-toolbar">
            <span>Último registro <strong>{time(latest?.timestamp)}</strong></span>
            <button type="button" className="mine-primary" disabled={busy||!activeSite.enabled} onClick={checkNow}>
              {busy?'Verificando…':'↻ Verificar agora'}
            </button>
          </div>
          <div className="mine-metric-title"><h4>Indicadores</h4>
            <button type="button" className="mine-quiet" aria-expanded={metricEditor} onClick={()=>setMetricEditor(x=>!x)}>{metricEditor?'Concluir':'Personalizar'}</button></div>
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
          <section className="mine-history" aria-label="Histórico técnico do serviço">
            <div className="mine-history-head"><div><h4>Histórico técnico</h4><p>Últimas amostras salvas</p></div>
              <label>Filtrar <select value={historyFilter} onChange={e=>setHistoryFilter(e.target.value)}>
                <option value="all">Todos</option><option value="up">Disponíveis</option><option value="down">Falhas</option><option value="unknown">Inconclusivos</option>
              </select></label></div>
            {visibleHistory.length===0?<div className="mine-chart-empty">Nenhum registro corresponde a este filtro.</div>:
              <ol>{visibleHistory.map(s=><li key={s.id}>
                <span className={'mine-history-bullet '+classification(s)}/>
                <div><strong>{classification(s)==='up'?'Disponível':classification(s)==='down'?'Falha HTTP':'Inconclusivo'}</strong>
                  <small>{s.statusCode>0?'HTTP '+s.statusCode:'Sem resposta HTTP'} · {latency(s.latencyMs)}{s.source==='manual'?' · Manual':''}{s.error?' · '+s.error:''}</small></div>
                <time>{time(s.timestamp)}</time>
              </li>)}</ol>}
          </section>
          <details className="mine-scheduler">
            <summary>Agendador e limites do monitoramento <span>⌄</span></summary>
            <div className="mine-scheduler-content">
              <p>Última execução: <strong>{schedulerAt?time(schedulerAt):'Não informada'}</strong></p>
              <p>Próxima estimativa: <strong>{nextAt?time(nextAt):'Indisponível'}</strong></p>
              <p>Cadência observada: aproximadamente 10 minutos. O cron externo pode sofrer atrasos; a atualização da tela não executa testes.</p>
              <p>O histórico contém até 40 registros recentes. A taxa de amostras positivas não é uma garantia de disponibilidade contínua.</p>
            </div>
          </details>
        </section>}
        <p className="mine-footnote mine-bottom-note">As verificações usam requisições HTTPS. Monitoramento pausado não significa que o site esteja indisponível.</p>
      </>}
    {error&&<div className="mine-error" role="alert">{error}</div>}
    {notice&&<div className="mine-notice" role="status">{notice}</div>}
  </section>;
}
