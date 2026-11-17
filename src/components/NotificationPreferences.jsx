import {useEffect,useState} from 'react';
import {monitorRequest} from '../monitorAccount';
import {allowsNotification,notificationCategories} from '../../shared/notification-preferences';
import './Notifications.css';

const path = '/api/meus-sites?view=notification-preferences';

export default function NotificationPreferences({onBack}) {
  const [saved,setSaved] = useState(null);
  const [draft,setDraft] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [attempt,setAttempt] = useState(0);

  useEffect(()=>{
    let active = true;
    monitorRequest(path).then(({preferences})=>{
      if (active) { setSaved(preferences); setDraft(preferences); }
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[attempt]);

  const changed = draft && notificationCategories.some(({id})=>draft[id]!==saved[id]);
  const toggle = (category,channel) => {
    const kind = category.kinds[0];
    setDraft(current=>{
      const inbox = allowsNotification(current,kind,'inbox') !== (channel==='inbox');
      const push = allowsNotification(current,kind,'push') !== (channel==='push');
      return {...current,[category.id]:inbox?(push?'both':'inbox'):(push?'push':'off')};
    });
    setNotice('');
  };

  async function save(event) {
    event.preventDefault();
    setBusy(true);setNotice('');setError('');
    try {
      const result = await monitorRequest(path,{method:'PATCH',body:JSON.stringify({preferences:draft})});
      setSaved(result.preferences);
      setDraft(result.preferences);
      setNotice('Preferências salvas.');
      window.dispatchEvent(new Event('jeltops-notifications-change'));
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <section className="notification-preferences" aria-label="Preferências de notificações">
    <button type="button" className="mine-quiet notification-back" onClick={onBack}>‹ Voltar</button>
    <p>Escolha onde receber cada aviso. Para receber push, ative as notificações em cada dispositivo.</p>
    {error&&<p className="notification-preferences-error" role="alert">{error}</p>}
    {!draft?
      error?<button type="button" className="mine-quiet notification-back" onClick={()=>{setError('');setAttempt(attempt+1);}}>Tentar novamente</button>:
      <p role="status">Carregando preferências…</p>:
      <form onSubmit={save}>
        <div className="notification-preference-list">
          {notificationCategories.map(category=><div className="notification-preference-row" key={category.id}
            role="group" aria-label={category.label}>
            <strong>{category.label}</strong>
            <div className="notification-preference-channels">
              {[['inbox','Sino'],['push','Dispositivo']].map(([channel,label])=><button key={channel}
                type="button" disabled={busy} aria-label={label} className="mine-quiet"
                aria-pressed={allowsNotification(draft,category.kinds[0],channel)}
                onClick={()=>toggle(category,channel)}>{label}</button>)}
            </div>
          </div>)}
        </div>
        <div className="notification-preference-footer">
          <button type="submit" className="mine-primary" disabled={!changed||busy}>{busy?'Salvando…':'Salvar preferências'}</button>
          {notice&&<p role="status">{notice}</p>}
        </div>
      </form>}
  </section>;
}
