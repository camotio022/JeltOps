import {useEffect,useState} from 'react';
import {monitorRequest,roleLabels} from '../monitorAccount';
import AccountAvatar from './AccountAvatar';
import AccountConfirm from './AccountConfirm';
import './Account.css';

function RoleChoices({label, value, onSelect, disabled}) {
  return <div className="account-role-choices" role="group" aria-label={label}>
    {['viewer','operator'].map(role=><button key={role} type="button"
      aria-pressed={value===role} disabled={disabled}
      onClick={()=>{if(value!==role)onSelect(role);}}>{roleLabels[role]}</button>)}
  </div>;
}

export default function MonitorTeam({site,onChanged}) {
  const [team,setTeam] = useState(null);
  const [email,setEmail] = useState('');
  const [role,setRole] = useState('viewer');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [confirmation,setConfirmation] = useState(null);
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
      await onChanged(body.action);
    } catch(e){setError(e.message)} finally {setBusy(false)}
  };

  return <section className="account-panel monitor-team" aria-label={'Equipe de '+site.name}>
    <div className="account-heading"><h3>Membros</h3><span>{team?.members.length ?? site.memberCount ?? 1} acompanhando</span></div>
    {error&&<p className="account-feedback is-error" role="alert">{error}</p>}
    {notice&&<p className="account-feedback" role="status">{notice}</p>}
    {!team&&!error&&<p role="status">Carregando equipe…</p>}
    {team&&<>
      <ul className="account-list">
        {team.members.map(member=><li key={member.uid}>
          <div className="account-identity"><AccountAvatar name={member.name} photo={member.photo}/>
            <div><strong>{member.name}</strong><p>{roleLabels[member.role]}</p></div>
          </div>
          {team.role==='owner'&&member.role!=='owner'&&<details className="account-member-settings">
            <summary>Gerenciar <span className="account-sr-only">{member.name}</span></summary>
            <div className="account-actions">
              <RoleChoices label={'Função de '+member.name} value={member.role} disabled={busy}
                onSelect={next=>change({action:'change_role',memberUid:member.uid,role:next},'Função atualizada.')}/>
              <button className="mine-quiet" type="button" disabled={busy} onClick={()=>setConfirmation({
                title:'Remover '+member.name+'?',
                description:'O acesso ao monitor '+site.name+' e ao histórico será revogado.',
                label:'Remover membro',body:{action:'remove_member',memberUid:member.uid},message:'Membro removido.'
              })}>Remover</button>
            </div>
          </details>}
        </li>)}
      </ul>
      {team.role==='owner'?<>
        <form className="account-form account-invite" onSubmit={event=>{
          event.preventDefault();change({action:'invite',email,role},'Convite registrado. A pessoa pode aceitar em Meu perfil.');
        }}>
          <label>E-mail do convidado<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <RoleChoices label="Permissão do convidado" value={role} onSelect={setRole} disabled={busy}/>
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
      </>:<button className="mine-quiet" type="button" disabled={busy} onClick={()=>setConfirmation({
        title:'Sair da equipe?',
        description:'Você perderá o acesso ao monitor '+site.name+' e ao histórico compartilhado.',
        label:'Sair da equipe',body:{action:'leave_team'},message:'Você saiu da equipe.'
      })}>Sair da equipe</button>}
    </>}
    {confirmation&&<AccountConfirm title={confirmation.title} description={confirmation.description}
      actionLabel={confirmation.label} onCancel={()=>setConfirmation(null)}
      onConfirm={()=>{setConfirmation(null);change(confirmation.body,confirmation.message);}}/>}
  </section>;
}
