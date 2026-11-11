import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import './MySites.css';

const time = (v) => v ? new Date(v).toLocaleString('pt-BR') : 'Aguardando';
const latency = (v) => Number.isFinite(Number(v)) ? Math.round(Number(v)) + ' ms' : '—';
const MAX = 3;

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

  useEffect(()=>{
    const unsubscribe=onAuthStateChanged(auth,setUser,()=>setUser(null));
    getRedirectResult(auth).catch((e)=>setError('Não foi possível concluir o login: '+e.message));
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
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(body.error||'Não foi possível carregar os sites.');
    return body;
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
    try {await signInWithPopup(auth,new GoogleAuthProvider())}
    catch(e){
      if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment','auth/cancelled-popup-request'].includes(e.code)){
        try{await signInWithRedirect(auth,new GoogleAuthProvider())}catch(err){setError(err.message)}
      }else if(e.code!=='auth/popup-closed-by-user'){setError(e.message)}
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
    const ok=await mutate('/api/meus-sites',{method:'POST',body:JSON.stringify({name,url})},'Site cadastrado. A primeira verificação ocorrerá na próxima execução agendada.');
    if(ok){setName('');setUrl('');setFormOpen(false)}
  };
  const toggle=site=>mutate('/api/meus-sites?id='+encodeURIComponent(site.id),{method:'PATCH',body:JSON.stringify({action:'toggle'})},site.enabled?'Monitoramento pausado.':'Monitoramento ativado.');
  const remove=async(site)=>{
    if(!window.confirm('Excluir "'+site.name+'" e seu histórico de verificações?'))return;
    const ok=await mutate('/api/meus-sites?id='+encodeURIComponent(site.id),{method:'DELETE'},'Monitoramento excluído.');
    if(ok && selected===site.id)setSelected('TODOS');
  };
  const latest=samples[0]||null;
  const metrics=useMemo(()=>{
    const up=samples.filter(s=>s.status==='UP').length;
    return {rate:samples.length?((up/samples.length)*100).toFixed(1)+'%':'—',avg:samples.length?latency(samples.reduce((sum,s)=>sum+Number(s.latencyMs||0),0)/samples.length):'—'};
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
        <small>As referências públicas do JeltOps continuam acessíveis sem login.</small>
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
            <div className="mine-indicator-grid">
              <div><span>ÚLTIMO ESTADO</span><strong>{latest?.status==='UP'?'Online':latest?.status==='DOWN'?'Falha':'Sem coleta'}</strong><small>{latest?'HTTP '+latest.statusCode:'Aguardando monitor'}</small></div>
              <div><span>LATÊNCIA MÉDIA</span><strong>{metrics.avg}</strong><small>Das últimas {samples.length} amostras</small></div>
              <div><span>AMOSTRAS POSITIVAS</span><strong>{metrics.rate}</strong><small>Não representa tempo contínuo disponível</small></div>
            </div>
            <div className="mine-history">
              <h4>Histórico particular</h4>
              {!samples.length?<p>A primeira verificação aparecerá após a execução do agendador.</p>:
               <ol>{samples.slice(0,12).map(s=><li key={s.id}><span className={s.status==='UP'?'mine-running':'mine-paused'}>{s.status==='UP'?'● Online':'● Falha'}</span><span>HTTP {s.statusCode} · {latency(s.latencyMs)}</span><time>{time(s.timestamp)}</time></li>)}</ol>}
            </div>
          </>}
        </section>}
        <p className="mine-footnote">Verificação conforme o agendador do JeltOps. Gravação estável a cada 10 minutos e eventos de mudança na próxima coleta. Indicadores baseados em amostras, não em disponibilidade contínua.</p>
      </>}
    {error&&<div className="mine-error" role="alert">{error}</div>}
    {notice&&<div className="mine-notice" role="status">{notice}</div>}
  </section>;
}
