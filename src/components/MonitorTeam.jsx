import {useEffect,useState} from 'react';
import {monitorRequest,roleLabels} from '../monitorAccount';
import AccountAvatar from './AccountAvatar';
import './Account.css';

export default function MonitorTeam({site,onChanged}) {
  const [team,setTeam] = useState(null);
  const [email,setEmail] = useState('');
  const [role,setRole] = useState('viewer');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const path = '/api/meus-sites?view=team&id='+encodeURIComponent(site.id);

  useEffect(()=>{
    let active = true;
    monitorRequest(path).then(data=>{if(active)setTeam(data)}).catch(e=>{if(active)setError(e.message)});
    return ()=>{active=false};
  },[path,site.memberCount,site.role]);
  const change = async (body, message) => {
    setBusy(true);setError('');setNotice('');
    try {
      await monitorRequest(path,{method:'POST',body:JSON.stringify(body)});
      if (body.action !== 'leave_team') setTeam(await monitorRequest(path));
      setNotice(message);
      if (body.action==='invite') setEmail('');
      await onChanged();
    } catch(e){setError(e.message)} finally {setBusy(false)}
  };

  return <section className="account-panel monitor-team" aria-label={'Equipe de '+site.name}>
    <div className="account-heading"><h4>Equipe</h4><span>{team?.members.length ?? site.memberCount ?? 1} acompanhando</span></div>
    {error&&<p className="account-feedback is-error" role="alert">{error}</p>}
    {notice&&<p className="account-feedback" role="status">{notice}</p>}
    {!team&&!error&&<p role="status">Carregando equipe…</p>}
    {team&&<>
      <ul className="account-list">
        {team.members.map(member=><li key={member.uid}>
          <div className="account-identity"><AccountAvatar name={member.name} photo={member.photo}/>
            <div><strong>{member.name}</strong><p>{roleLabels[member.role]}</p></div>
          </div>
          {team.role==='owner'&&member.role!=='owner'&&<div className="account-actions">
            <select aria-label={'Função de '+member.name} value={member.role} disabled={busy} onChange={e=>change({
              action:'change_role',memberUid:member.uid,role:e.target.value
            },'Função atualizada.')}>
              <option value="viewer">Observador</option><option value="operator">Operador</option>
            </select>
            <button className="mine-quiet" type="button" disabled={busy} onClick={()=>change({action:'remove_member',memberUid:member.uid},'Membro removido.')}>Remover</button>
          </div>}
        </li>)}
      </ul>
      {team.role==='owner'?<>
        <form className="account-form account-invite" onSubmit={event=>{
          event.preventDefault();change({action:'invite',email,role},'Convite registrado. A pessoa pode aceitar em Meu perfil.');
        }}>
          <label>E-mail do convidado<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label>Permissão<select value={role} onChange={e=>setRole(e.target.value)}>
            <option value="viewer">Observador</option><option value="operator">Operador</option>
          </select></label>
          <p>{role==='operator'?'Acompanha o histórico e pode verificar o site.':'Acompanha o status e o histórico do site.'}</p>
          <button type="submit" className="mine-primary" disabled={busy}>{busy?'Aguarde…':'Convidar pessoa'}</button>
        </form>
        {team.invitations.length>0&&<ul className="account-list">
          {team.invitations.map(invite=><li key={invite.email}>
            <div><strong>{invite.email}</strong><p>Convite pendente · {roleLabels[invite.role]}</p></div>
            <button type="button" className="mine-quiet" disabled={busy}
              onClick={()=>change({action:'cancel_invite',email:invite.email},'Convite cancelado.')}>Cancelar convite</button>
          </li>)}
        </ul>}
      </>:<button className="mine-quiet" type="button" disabled={busy} onClick={()=>{
        if(window.confirm('Sair da equipe de '+site.name+'?'))change({action:'leave_team'},'Você saiu da equipe.');
      }}>Sair da equipe</button>}
    </>}
  </section>;
}
