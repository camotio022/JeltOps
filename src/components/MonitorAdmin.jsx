import {useEffect,useState} from 'react';
import {monitorRequest} from '../monitorAccount';
import './MonitorAdmin.css';

const sections = {operation:'Operação',monitors:'Monitores',users:'Usuários'};
const formatDate = at => at===null ? 'Sem registro' : new Date(at).toLocaleString('pt-BR',{
  dateStyle:'short',timeStyle:'short'
});
const status = {UP:'Disponível',DOWN:'Indisponível',UNKNOWN:'Inconclusivo'};
const pageSize = 25;

export default function MonitorAdmin({onBack}) {
  const [data,setData] = useState(null);
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  const [section,setSection] = useState('operation');
  const [lateOnly,setLateOnly] = useState(false);
  const [limit,setLimit] = useState(pageSize);

  useEffect(()=>{
    let active=true;
    monitorRequest('/api/meus-sites?view=admin').then(result=>{
      if (active) setData(result);
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[reload]);

  function navigate(next,overdue=false) {
    setSection(next);
    setLateOnly(overdue);
  }

  function refresh() {
    setError('');
    setData(null);
    setReload(value=>value+1);
  }

  return <section className="admin-console" aria-label="Administração do monitoramento">
    <div className="admin-toolbar">
      <button type="button" className="mine-quiet" onClick={onBack}>‹ Meu perfil</button>
      {data&&<button type="button" className="mine-quiet" onClick={refresh}>Atualizar</button>}
    </div>
    {error?<div className="admin-section"><p role="alert">{error}</p>
      <button type="button" className="mine-quiet" onClick={refresh}>Tentar novamente</button></div>:
      !data?<p role="status">Carregando administração…</p>:<>
        <div className="admin-stats">
          <button type="button" onClick={()=>navigate('users')}><span>Usuários ativos em 7 dias</span><strong>{data.summary.activeUsers}</strong></button>
          <button type="button" onClick={()=>navigate('monitors')}><span>Monitores ativos</span><strong>{data.summary.activeMonitors}</strong></button>
          <button type="button" onClick={()=>navigate('monitors',true)}><span>Checagens atrasadas</span><strong>{data.summary.overdueMonitors}</strong></button>
        </div>
        <nav className="admin-sections" aria-label="Seções da administração">
          {Object.entries(sections).map(([key,label])=><button type="button" key={key}
            aria-current={section===key?'page':undefined} onClick={()=>navigate(key)}>{label}</button>)}
        </nav>
        {section==='operation'&&<section className="admin-section" aria-label="Operação">
          <div className="admin-heading"><h3>Agendador</h3>
            <span className="admin-status" data-tone={data.operation.overdue||data.operation.runFailures?'attention':'normal'}>
              {data.operation.overdue?'Checagem atrasada':data.operation.runFailures?'Execução com falhas':
                data.operation.lastCompletedAt?'Em dia':'Sem execução registrada'}
            </span>
          </div>
          <dl className="admin-data">
            <div><dt>Último início</dt><dd>{formatDate(data.operation.lastStartedAt)}</dd></div>
            <div><dt>Última conclusão</dt><dd>{formatDate(data.operation.lastCompletedAt)}</dd></div>
            <div><dt>Última execução com falha</dt><dd>{formatDate(data.operation.lastFailureAt)}
              {data.operation.lastFailureAt!==null&&' · '+data.operation.lastFailureCount}</dd></div>
          </dl>
          {data.summary.overdueMonitors>0&&<button type="button" className="mine-quiet"
            onClick={()=>navigate('monitors',true)}>Ver monitores atrasados</button>}
        </section>}
        {section==='monitors'&&<section className="admin-section" aria-label="Monitores">
          <div className="admin-heading"><h3>Monitores</h3>
            <button type="button" className="mine-quiet" aria-pressed={lateOnly} onClick={()=>setLateOnly(value=>!value)}>Só atrasados</button>
          </div>
          {!data.monitors.some(site=>!lateOnly||site.overdue)&&<p>{lateOnly?'Nenhum monitor atrasado.':'Nenhum monitor cadastrado.'}</p>}
          {data.monitors.filter(site=>!lateOnly||site.overdue).map(site=><details className="admin-monitor" key={site.id}>
            <summary>
              <strong>{site.domain}</strong>
              <span className="admin-status" data-tone={site.overdue||site.lastStatus==='UNKNOWN'?'attention':
                site.enabled&&site.lastStatus==='DOWN'?'error':'normal'}>
                {site.enabled?(site.overdue?'Checagem atrasada':status[site.lastStatus]??'Aguardando checagem'):'Pausado'}
              </span>
              <small>{formatDate(site.lastCheckAt)}</small>
            </summary>
            <dl className="admin-data">
              <div><dt>Proprietário</dt><dd>{site.owner}</dd></div>
              <div><dt>Última checagem automática</dt><dd>{formatDate(site.lastCheckAt)}</dd></div>
              <div><dt>Último resultado</dt><dd>{status[site.lastStatus]??'Sem registro'}</dd></div>
            </dl>
          </details>)}
          <p>O atraso é sinalizado após {data.operation.lateAfterMinutes} minutos sem checagem automática.</p>
        </section>}
        {section==='users'&&<section className="admin-section" aria-label="Usuários">
          <h3>Usuários</h3>
          <p>Atividade recente considera a renovação de sessão registrada pelo Firebase.</p>
          {data.accounts.length===0&&<p>Nenhum usuário cadastrado.</p>}
          <ul className="admin-users">{data.accounts.slice(0,limit).map(account=><li key={account.uid}>
            <div><strong>{account.name||account.email||'Conta sem nome'}</strong>
              {account.name&&account.email&&<small>{account.email}</small>}
              {account.disabled&&<small>Conta desativada</small>}</div>
            <small>Último login · {formatDate(account.lastSignInAt)}<br/>Atividade · {formatDate(account.lastActivityAt)}</small>
          </li>)}</ul>
          {limit<data.accounts.length&&<button type="button" className="mine-quiet" onClick={()=>setLimit(value=>value+pageSize)}>Mostrar mais</button>}
        </section>}
    </>}
  </section>;
}
