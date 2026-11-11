import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import './MySites.css';

const time = (v) => v ? new Date(v).toLocaleString('pt-BR') : 'Aguardando';
const latency = (v) => Number.isFinite(Number(v)) ? Math.round(Number(v)) + ' ms' : '—';
const MAX = 3;
const METRIC_LABELS = {
  status:'Estado do serviço',latency:'Latência média',success:'Amostras positivas',
  http:'Último código HTTP',lastCheck:'Última coleta registrada',sampleCount:'Respostas verificadas'
};

export default function MySites() {
  const [user,setUser] = useState(undefined);
  const [sites,setSites] = useState([]);
  const [samples,setSamples] = useState([]);
  const [selected,setSelected] = useState('TODOS');
  const [name,setName] = useState('');
  const [url,setUrl] = useState('');
  const [formOpen,setFormOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [metricEditor,setMetricEditor] = useState(false);
  const [clock,setClock] = useState(Date.now());

  useEffect(()=>{
    const unsubscribe=onAuthStateChanged(auth,setUser,()=>setUser(null));
    return unsubscribe;
  },[]);

  const request=useCallback(async (path='/api/meus-sites',options={})=>{
    const current=auth.currentUser;
    if(!current) throw new Error('Entre com sua conta Google.');
    const token=await current.getIdToken();
    const response=await fetch(path,{
      ...options,
      cache:'no-store',
      headers:{Accept:'application/json',Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}
    });
    const body=await response.json().catch(()=>null);
    if(!response.ok) {
      const readableError=typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : '';
      const statusError=response.status >= 500
        ? 'A API do JeltOps está indisponível. Tente novamente após a correção do servidor.'
        : response.status===401 ? 'Sessão expirada. Saia da conta e entre novamente.'
        : 'Não foi possível processar o cadastro.';
      throw new Error(readableError || statusError);
    }
    return body || {};
  },[]);

  const load=useCallback(async(showLoading=false)=>{
    if(!auth.currentUser)return;
    if(showLoading)setLoading(true);
    try {
      const result=await request();
      setSites(result.sites||[]);
      setError('');
    }catch(e){setError(e.message)}
    finally{if(showLoading)setLoading(false)}
  },[request]);
  useEffect(()=>{
    if(!user){setSites([]);setSamples([]);return;}
    load(true);
    const timer=setInterval(()=>load(false),60_000);
    return()=>clearInterval(timer);
  },[user,load]);

  const activeSite=useMemo(()=>sites.find(site=>site.id===selected),[sites,selected]);
  useEffect(()=>{setMetricEditor(false)},[selected]);
  useEffect(()=>{
    const t=setInterval(()=>setClock(Date.now()),1000);
    return()=>clearInterval(t);
  },[]);
  useEffect(()=>{
    if(!user || !activeSite){setSamples([]);return;}
    let mounted=true;
    const fetchSamples=async()=>{
      try {const result=await request('/api/meus-sites?id='+encodeURIComponent(activeSite.id));if(mounted)setSamples(result.samples||[])}
      catch(e){if(mounted)setError(e.message)}
    };
    fetchSamples();
    const timer=setInterval(fetchSamples,60_000);
    return()=>{mounted=false;clearInterval(timer)};
  },[user,activeSite,request]);

  const login=async()=>{
    setError('');
    try {
      // Do not fall back to signInWithRedirect: Safari/iOS and third-party
      // storage partitioning break redirect flows on Vercel-hosted PWAs.
      await signInWithPopup(auth,new GoogleAuthProvider());
    } catch(e) {
      const messages={
        'auth/unauthorized-domain':'O domínio jeltops.vercel.app precisa estar autorizado no Firebase Authentication.',
        'auth/operation-not-allowed':'O login com Google ainda não está ativado no Firebase Authentication.',
        'auth/invalid-api-key':'A chave da configuração Firebase precisa ser conferida.',
        'auth/popup-blocked':'O navegador bloqueou a janela do Google. Abra jeltops.vercel.app diretamente no Safari e tente novamente.',
        'auth/operation-not-supported-in-this-environment':'O login não é compatível com este navegador integrado. Abra jeltops.vercel.app diretamente no Safari.',
        'auth/internal-error':'Não foi possível iniciar o login. Confira os domínios autorizados e as configurações do provedor Google no Firebase.'
      };
      if(e.code !== 'auth/popup-closed-by-user') {
        setError(messages[e.code]||'Não foi possível entrar com Google. Confira a configuração do Firebase ou abra o site diretamente no Safari.');
      }
    }
  };
  const mutate=async(path,options,success)=>{
    setBusy(true);setError('');setNotice('');
    try{await request(path,options);setNotice(success);await load();return true}
    catch(e){setError(e.message);return false}
    finally{setBusy(false)}
  };
  const create=async(e)=>{
    e.preventDefault();
    setBusy(true);setError('');setNotice('');
    try {
      const result=await request('/api/meus-sites',{method:'POST',body:JSON.stringify({name,url})});
      setName('');setUrl('');setFormOpen(false);
      setSelected(result.site.id);
      setNotice('Site cadastrado e primeira verificação solicitada.');
      await load();
    } catch(err) {setError(err.message)}
    finally {setBusy(false)}
  };
  const toggle=site=>mutate('/api/meus-sites?id='+encodeURIComponent(site.id),{method:'PATCH',body:JSON.stringify({action:'toggle'})},site.enabled?'Monitoramento pausado.':'Monitoramento ativado.');
  const remove=async(site)=>{
    if(!window.confirm('Excluir "'+site.name+'" e seu histórico de verificações?'))return;
    const ok=await mutate('/api/meus-sites?id='+encodeURIComponent(site.id),{method:'DELETE'},'Monitoramento excluído.');
    if(ok && selected===site.id)setSelected('TODOS');
  };
  const checkNow=async()=>{
    if(!activeSite)return;
    setBusy(true);setError('');setNotice('');
    try {
      await request('/api/meus-sites?id='+encodeURIComponent(activeSite.id),
        {method:'POST',body:JSON.stringify({action:'check'})});
      const result=await request('/api/meus-sites?id='+encodeURIComponent(activeSite.id));
      setSamples(result.samples||[]);
      setNotice('Verificação executada e registrada no histórico.');
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  };
  const configure=async(metric)=>{
    if(!activeSite)return;
    const original=activeSite.metrics||['status','latency','success'];
    const next=original.includes(metric)?original.filter(x=>x!==metric):[...original,metric];
    if(!next.length){setError('Mantenha pelo menos um indicador.');return}
    const ok=await mutate('/api/meus-sites?id='+encodeURIComponent(activeSite.id),
      {method:'PATCH',body:JSON.stringify({action:'configure',metrics:next})},'Indicadores personalizados salvos na sua conta.');
    if(ok)setMetricEditor(true);
  };
  const latest=samples[0]||null;
  const metrics=useMemo(()=>{
    const measured=samples.filter(s=>(s.status==='UP'||s.status==='DOWN') && Number(s.statusCode)>0);
    const up=measured.filter(s=>s.status==='UP').length;
    return {rate:measured.length?((up/measured.length)*100).toFixed(1)+'%':'—',avg:measured.length?latency(measured.reduce((sum,s)=>sum+Number(s.latencyMs||0),0)/measured.length):'—',sampleCount:measured.length};
  },[samples]);

  return <section className="mine-page" aria-label="Meus sites monitorados">
    <header className="mine-hero">
      <div>
        <span className="eyebrow">SEU ESPAÇO / MONITORAMENTO PARTICULAR</span>
        <h2>Seus sites.<br/><em>Seu controle.</em></h2>
        <p>Escolha quais serviços acompanhar. A Central verifica automaticamente mesmo quando você fecha o aplicativo.</p>
      </div>
      <div className="mine-total"><span>MONITORES CADASTRADOS</span><strong>{sites.length.toString().padStart(2,'0')}<small> / {MAX}</small></strong></div>
    </header>
    {user===undefined?<div className="mine-state">Carregando sua sessão…</div>:
     !user?
      <article className="mine-login">
        <div className="mine-lock" aria-hidden="true">⌁</div>
        <h3>Seu monitoramento começa aqui.</h3>
        <p>Entre com sua conta Google para cadastrar até três sites e visualizar apenas seus próprios registros.</p>
        <button type="button" onClick={login} className="mine-primary">Entrar com Google</button>
        <small>As referências públicas do JeltOps continuam acessíveis sem login. No iPhone, abra o endereço diretamente no Safari se a janela de autenticação não funcionar.</small>
      </article>:
      <>
        <div className="mine-account">
          <div className="mine-user"><span className="mine-avatar">{(user.displayName||user.email||'U')[0].toUpperCase()}</span><span><strong>{user.displayName||'Minha conta'}</strong><small>{user.email}</small></span></div>
          <button className="mine-quiet" type="button" onClick={()=>signOut(auth)}>Sair da conta</button>
        </div>
        <div className="mine-actions">
          <div><h3>Monitoramentos</h3><p>Até {MAX} endereços públicos HTTPS por conta.</p></div>
          <button type="button" className="mine-primary" onClick={()=>setFormOpen(!formOpen)} disabled={sites.length>=MAX||busy}>{formOpen?'Fechar cadastro':'+ Adicionar site'}</button>
        </div>
        {formOpen&&<form className="mine-form" onSubmit={create}>
          <h3>Novo monitoramento</h3>
          <label htmlFor="site-name">Nome do serviço</label>
          <input id="site-name" autoComplete="off" minLength={3} maxLength={60} value={name} onChange={e=>setName(e.target.value)} required placeholder="Meu site"/>
          <label htmlFor="site-url">Endereço HTTPS</label>
          <input id="site-url" type="url" inputMode="url" autoCapitalize="none" autoComplete="url" value={url} onChange={e=>setUrl(e.target.value)} required placeholder="https://meusite.com.br"/>
          <p>Por segurança, aceitamos apenas o domínio HTTPS público, sem caminhos, parâmetros ou portas personalizadas.</p>
          <button type="submit" className="mine-primary" disabled={busy||name.trim().length<3}>{busy?'Salvando…':'Cadastrar e monitorar'}</button>
        </form>}
        {sites.length===0 && !loading?<div className="mine-state"><strong>Nenhum site cadastrado.</strong><span>Adicione seu primeiro serviço para começar.</span></div>:
          <div className="mine-list">{sites.map(site=><article className="mine-site" key={site.id}>
            <div className="mine-site-info"><span className="mine-site-icon" aria-hidden="true">◎</span><div><h4>{site.name}</h4><small>{site.url}</small><span className={site.enabled?'mine-running':'mine-paused'}>{site.enabled?'● Monitoramento ativado':'◌ Pausado'}</span></div></div>
            <div className="mine-site-buttons">
              <button type="button" onClick={()=>setSelected(site.id)} aria-pressed={selected===site.id} className={selected===site.id?'mine-selected':''}>Indicadores</button>
              <button type="button" disabled={busy} onClick={()=>toggle(site)}>{site.enabled?'Pausar':'Ativar'}</button>
              <button type="button" disabled={busy} onClick={()=>remove(site)} className="mine-delete">Excluir</button>
            </div>
          </article>)}</div>}
        {sites.length>0&&<section className="mine-indicators" aria-label="Indicadores personalizáveis">
          <div className="mine-indicator-head"><div><span className="eyebrow">INDICADORES / MINHA CONTA</span><h3>Escolha o que acompanhar</h3><p>As métricas são padronizadas; você escolhe qual dos seus endpoints visualizar.</p></div>
          <label htmlFor="mine-focus">Serviço em destaque
            <select id="mine-focus" value={selected} onChange={e=>setSelected(e.target.value)}>
              <option value="TODOS">Escolher um serviço</option>
              {sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label></div>
          {!activeSite?<div className="mine-state">Selecione um site para ver disponibilidade, latência e histórico particulares.</div>:
          <>
            <div className="mine-observability">
              <div className="mine-live-heading">
                <div><strong>Verificações do serviço</strong><small>Última amostra: {latest?time(latest.timestamp):'Ainda não há registros'}</small></div>
                <button type="button" className="mine-primary" disabled={busy||!activeSite.enabled} onClick={checkNow}>
                  {busy?'Verificando…':'↻ Verificar agora'}
                </button>
              </div>
              <div className="mine-monitor-facts">
                <span>Agendador observado: <strong>aproximadamente 10 min</strong></span>
                <span>Próxima execução: <strong>horário não confirmado</strong></span>
                <span>Atualização da tela: <strong>60 s</strong></span>
                <span>Horário atual: <strong>{new Date(clock).toLocaleTimeString('pt-BR')}</strong></span>
              </div>
              <p className="mine-footnote">O JeltOps não controla o cron-job.org. O horário exato da próxima verificação depende do agendador externo. “Última amostra” é o último resultado salvo, não necessariamente a última checagem.</p>
            </div>
            <div className="mine-metric-toolbar">
              <strong>Meu painel de indicadores</strong>
              <button type="button" className="mine-quiet" onClick={()=>setMetricEditor(!metricEditor)} aria-expanded={metricEditor}>
                ⚙ {metricEditor?'Concluir':'Personalizar'}
              </button>
            </div>
            {metricEditor&&<div className="mine-metric-editor">
              <strong>Escolha os indicadores deste site</strong>
              <p>Selecione os cards que deseja manter. As preferências ficam salvas na sua conta.</p>
              <div className="mine-metric-checkboxes">
                {Object.entries(METRIC_LABELS).map(([key,label])=><label key={key}>
                  <input type="checkbox" checked={(activeSite.metrics||['status','latency','success']).includes(key)} disabled={busy}
                    onChange={()=>configure(key)}/><span>{label}</span>
                </label>)}
              </div>
            </div>}
            <div className="mine-indicator-grid">
              {(activeSite.metrics||['status','latency','success']).map(key=>{
                const info={
                  status:{title:'ÚLTIMO ESTADO',value:latest?.status==='UP'?'Online':latest?.status==='DOWN'?'Falha':latest?'Inconclusivo':'Aguardando',note:latest?.statusCode>0?'HTTP '+latest.statusCode:latest?.error?'Sem resposta HTTP':'Sem dados'},
                  latency:{title:'LATÊNCIA MÉDIA',value:metrics.avg,note:'De '+metrics.sampleCount+' respostas HTTP'},
                  success:{title:'AMOSTRAS POSITIVAS',value:metrics.rate,note:'Não equivale ao uptime contínuo'},
                  http:{title:'ÚLTIMO CÓDIGO HTTP',value:latest?.statusCode>0?String(latest.statusCode):'—',note:latest?.error||'Sem resposta HTTP válida'},
                  lastCheck:{title:'ÚLTIMA AMOSTRA',value:latest?new Date(latest.timestamp).toLocaleTimeString('pt-BR'):'—',note:latest?new Date(latest.timestamp).toLocaleDateString('pt-BR'):'Aguardando coleta'},
                  sampleCount:{title:'RESPOSTAS HTTP',value:String(metrics.sampleCount),note:'Nas últimas '+samples.length+' amostras salvas'}
                }[key];
                if(!info)return null;
                return <div key={key} className={'mine-metric-card '+(key==='status'&&latest?.status==='DOWN'?'mine-metric-danger':'')}>
                  <span>{info.title}</span><strong>{info.value}</strong><small>{info.note}</small>
                </div>;
              })}
            </div>
            <div className="mine-history">
              <h4>Histórico particular</h4>
              {!samples.length?<p>A primeira verificação aparecerá após a execução do agendador.</p>:
               <ol>{samples.slice(0,12).map(s=><li key={s.id}><span className={s.status==='UP'?'mine-running':s.status==='DOWN'?'mine-paused':'mine-unknown'}>{s.status==='UP'?'● Online':s.status==='DOWN'?'● Falha':'◌ Inconclusiva'}</span><span>{s.statusCode>0?'HTTP '+s.statusCode:'Sem resposta HTTP'} · {latency(s.latencyMs)}{s.error?' · '+s.error:''}</span><time>{time(s.timestamp)}</time></li>)}</ol>}
            </div>
          </>}
        </section>}
        <p className="mine-footnote">Verificação conforme o agendador do JeltOps. Gravação estável a cada 10 minutos e eventos de mudança na próxima coleta. Indicadores baseados em amostras, não em disponibilidade contínua.</p>
      </>}
    {error&&<div className="mine-error" role="alert">{error}</div>}
    {notice&&<div className="mine-notice" role="status">{notice}</div>}
  </section>;
}
