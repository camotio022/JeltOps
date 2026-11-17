import {useCallback,useEffect,useRef,useState} from 'react';
import {monitorRequest,roleLabels} from '../monitorAccount';
import {auth} from '../firebaseConfig';
import './Notifications.css';

const inboxPath = '/api/meus-sites?view=notifications';
const empty = {invitations:[],activity:[],readThrough:0};
const isPushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const when = at => new Date(at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const activityTitle = event => event.kind==='paused'?'Monitor pausado':'Monitor reativado';

async function currentDevice() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration?.active) throw new Error('Reabra o JeltOps para concluir a ativação neste dispositivo.');
  return {registration,subscription:await registration.pushManager.getSubscription()};
}

export default function Notifications({user,onProfile}) {
  const [open,setOpen] = useState(()=>new URLSearchParams(location.search).get('notifications')==='1');
  const [focusSite,setFocusSite] = useState(()=>new URLSearchParams(location.search).get('invitation'));
  const [data,setData] = useState(null);
  const [device,setDevice] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const loadId = useRef(0);
  const uid = user?.uid;

  const request = useCallback((path,options)=>{
    if (!uid || uid !== auth.currentUser?.uid) throw new Error('Entre novamente para continuar.');
    return monitorRequest(path,options);
  },[uid]);

  const load = useCallback(async()=>{
    if (!uid) return;
    const requestId = ++loadId.current;
    try {
      const result = await request(inboxPath);
      if (loadId.current===requestId && auth.currentUser?.uid===uid) setData(result);
    } catch {
      if (loadId.current===requestId && auth.currentUser?.uid===uid && !document.hidden) setData(current=>current ?? false);
    }
  },[request,uid]);

  useEffect(()=>{
    setData(null);setDevice(null);setError('');setNotice('');
    load();
    const refresh = () => {if (!document.hidden) load();};
    const timer = setInterval(refresh,60_000);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('jeltops-notifications-change',refresh);
    return ()=>{
      loadId.current++;
      clearInterval(timer);
      document.removeEventListener('visibilitychange',refresh);
      window.removeEventListener('jeltops-notifications-change',refresh);
    };
  },[load]);

  useEffect(()=>{
    const url = new URL(location.href);
    if (url.searchParams.has('notifications')) {
      url.searchParams.delete('notifications');
      url.searchParams.delete('invitation');
      history.replaceState(history.state,'',url);
    }
    const handle = event => {
      if (event.data?.type==='jeltops-open-notifications') {
        setFocusSite(event.data.siteId ?? null);
        setOpen(true);
        load();
      }
    };
    navigator.serviceWorker?.addEventListener('message',handle);
    return ()=>navigator.serviceWorker?.removeEventListener('message',handle);
  },[load]);

  const pushRequest = useCallback(body=>request('/api/meus-sites?view=push',
    {method:'POST',body:JSON.stringify(body)}),[request]);

  const loadDevice = useCallback(async()=>{
    if (!uid || !isPushSupported()) return;
    try {
      const {subscription} = await currentDevice();
      const status = await pushRequest({action:'status',endpoint:subscription?.endpoint});
      if (auth.currentUser?.uid===uid) setDevice(status);
    } catch (e) {
      if (auth.currentUser?.uid===uid) setDevice({error:e.message});
    }
  },[pushRequest,uid]);

  useEffect(()=>{
    if (!open) return;
    const panel = dialog.current;
    panel.showModal();
    return ()=>{
      panel.close();
      trigger.current?.focus();
    };
  },[open]);

  useEffect(()=>{
    if (!open) return;
    load();
    loadDevice();
  },[open,load,loadDevice]);

  const run = async fn => {
    setBusy(true);setError('');setNotice('');
    try { await fn(); } catch (e) {
      if (auth.currentUser?.uid===uid) setError(e.message);
    } finally {setBusy(false);}
  };

  function respond(invite,accept) {
    return run(async()=>{
      await request('/api/meus-sites?view=team&id='+encodeURIComponent(invite.siteId),{
        method:'POST',body:JSON.stringify({action:accept?'accept_invite':'decline_invite'})
      });
      setNotice(accept?'Convite aceito. O monitor está em Meus sites.':'Convite recusado.');
      await load();
      window.dispatchEvent(new Event('jeltops-team-change'));
    });
  }

  const markRead = () => run(async()=>{
    await request(inboxPath,{method:'PATCH',body:JSON.stringify({readThrough:data.activity[0].at})});
    await load();
  });

  const enable = () => run(async()=>{
    if (await Notification.requestPermission()!=='granted') {
      throw new Error('Permita as notificações nas configurações deste navegador para ativá-las.');
    }
    const {registration,subscription:previous} = await currentDevice();
    const subscription = previous ?? await registration.pushManager.subscribe({
      userVisibleOnly:true,applicationServerKey:device.publicKey
    });
    await pushRequest({action:'enable',subscription:subscription.toJSON()});
    await loadDevice();
    setNotice('Notificações ativadas neste dispositivo.');
  });

  const useDevice = action => run(async()=>{
    const {subscription} = await currentDevice();
    if (!subscription) throw new Error('Ative as notificações neste dispositivo.');
    await pushRequest({action,endpoint:subscription.endpoint});
    if (action==='disable') {
      await subscription.unsubscribe();
      await loadDevice();
    }
    setNotice(action==='test'?'Teste enviado ao serviço de notificações.':'Notificações desativadas neste dispositivo.');
  });

  const {invitations,activity,readThrough} = data || empty;
  const orderedInvites = [...invitations].sort((a,b)=>Number(b.siteId===focusSite)-Number(a.siteId===focusSite));
  const unread = activity.filter(event=>event.at>readThrough).length;
  const badge = invitations.length+unread;
  return <>
    {user&&<button ref={trigger} className="account-header-button notification-trigger" type="button"
      aria-haspopup="dialog" aria-expanded={open} aria-label={badge?'Notificações, '+badge+' pendências':'Notificações'}
      title="Notificações" onClick={()=>setOpen(true)}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>
      </svg>
      {badge>0&&<span className="notification-badge" aria-hidden="true">{badge>99?'99+':badge}</span>}
    </button>}
    {open&&<dialog ref={dialog} className="notification-panel" aria-labelledby="notification-title"
      onCancel={event=>{event.preventDefault();setOpen(false);}}
      onClick={event=>{if(event.target===event.currentTarget) setOpen(false);}}>
      <div className="notification-content">
        <header className="notification-header"><h2 id="notification-title">Notificações</h2>
          <button type="button" autoFocus className="mine-quiet notification-close" aria-label="Fechar notificações" onClick={()=>setOpen(false)}>×</button></header>
        {!uid?<div className="notification-empty"><p>Entre para ver seus convites e a atividade da equipe.</p>
          <button type="button" className="mine-primary" onClick={()=>{setOpen(false);onProfile();}}>Abrir perfil</button></div>:<>
          {notice&&<p className="notification-feedback" role="status">{notice}</p>}
          {error&&<p className="notification-feedback notification-error" role="alert">{error}</p>}
          {data===null?<p className="notification-empty" role="status">Carregando notificações…</p>:
            data===false?<div className="notification-empty"><p>Não foi possível carregar as notificações.</p>
              <button type="button" className="mine-quiet" onClick={load}>Tentar novamente</button></div>:
              invitations.length===0&&activity.length===0&&<p className="notification-empty">Você está em dia.</p>}
          {invitations.length>0&&<section aria-label="Convites pendentes">
            <h3>Convites pendentes</h3>
            <ul>{orderedInvites.map(invite=><li key={invite.siteId} className={invite.siteId===focusSite?'notification-unread':''}>
              <strong>{invite.siteName}</strong>
              <p>{invite.invitedBy?invite.invitedBy+' · ':''}{roleLabels[invite.role]}</p>
              <div className="notification-actions">
                <button type="button" disabled={busy} className="mine-primary" onClick={()=>respond(invite,true)}>Aceitar</button>
                <button type="button" disabled={busy} className="mine-quiet" onClick={()=>respond(invite,false)}>Recusar</button>
              </div>
            </li>)}</ul>
          </section>}
          {activity.length>0&&<section aria-label="Atividade dos monitores">
            <div className="notification-section-heading"><h3>Atividade</h3>
              {unread>0&&<button type="button" className="mine-quiet" disabled={busy} onClick={markRead}>Marcar como lidas</button>}</div>
            <ul>{activity.map(event=><li key={event.id} className={event.at>readThrough?'notification-unread':''}>
              <strong>{activityTitle(event)} · {event.siteName}</strong>
              <p>{event.actorName} · <time dateTime={new Date(event.at).toISOString()}>{when(event.at)}</time></p>
            </li>)}</ul>
          </section>}
          <section className="notification-device" aria-label="Notificações do dispositivo">
            <h3>Neste dispositivo</h3>
            {!isPushSupported()?<p>Push indisponível neste navegador. No iPhone ou iPad, adicione o JeltOps à Tela de Início e abra por lá.</p>:
              device?.error?<p>{device.error}</p>:!device?<p>Verificando suporte a push…</p>:
              device.occupied?<p>As notificações deste navegador estão vinculadas a outra conta.</p>:
              device.active?<><p>Notificações nativas de convites ativadas.</p>
                <div className="notification-actions">
                  <button type="button" className="mine-quiet" disabled={busy||!device.publicKey} onClick={()=>useDevice('test')}>Enviar teste</button>
                  <button type="button" className="mine-quiet" disabled={busy} onClick={()=>useDevice('disable')}>Desativar</button>
                </div></>:!device.publicKey?<p>O envio por push está indisponível.</p>:
              Notification.permission==='denied'?<p>Notificações bloqueadas nas configurações deste navegador.</p>:
              <button type="button" className="mine-quiet" disabled={busy} onClick={enable}>Ativar neste dispositivo</button>}
          </section>
        </>}
      </div>
    </dialog>}
  </>;
}
