import {useEffect,useRef,useState} from 'react';
import {GoogleAuthProvider,signInWithPopup,signOut} from 'firebase/auth';
import {auth} from '../firebaseConfig';
import {monitorRequest,roleLabels} from '../monitorAccount';
import AccountAvatar from './AccountAvatar';
import './Account.css';

async function resizePhoto(file) {
  if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type) || file.size > 10_000_000) {
    throw new Error('Escolha uma foto JPEG, PNG, WebP ou AVIF de até 10 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 192;
    const context = canvas.getContext('2d');
    const side = Math.min(bitmap.width,bitmap.height);
    context.fillStyle = '#141d27';
    context.fillRect(0,0,192,192);
    context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,192,192);
    return canvas.toDataURL('image/jpeg',.8);
  } finally {
    bitmap.close();
  }
}

export default function MyProfile({user,onProfile,onSites}) {
  const photoInput = useRef(null);
  const [profile,setProfile] = useState(null);
  const [invitations,setInvitations] = useState([]);
  const [name,setName] = useState('');
  const [photo,setPhoto] = useState(undefined);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  useEffect(()=>{
    if (!user) return;
    let active = true;
    monitorRequest('/api/meus-sites?view=profile').then(data=>{
      if (!active) return;
      setProfile(data.profile);
      setName(data.profile.name);
      setPhoto(undefined);
      setInvitations(data.invitations || []);
      onProfile(data.profile);
    }).catch(e=>{if(active)setError(e.message)});
    return ()=>{active=false};
  },[user,onProfile]);

  const run = async fn => {
    setBusy(true);setError('');setNotice('');
    try {await fn()} catch(e){setError(e.message)} finally {setBusy(false)}
  };
  const submit = event => {
    event.preventDefault();
    run(async()=>{
      const data=await monitorRequest('/api/meus-sites?view=profile',{method:'PATCH',body:JSON.stringify({name,photo})});
      setProfile(data.profile);onProfile(data.profile);setPhoto(undefined);
      setNotice('Perfil salvo.');
    });
  };
  const respond = (invite,accept) => run(async()=>{
    await monitorRequest('/api/meus-sites?view=team&id='+encodeURIComponent(invite.siteId),{
      method:'POST',body:JSON.stringify({action:accept?'accept_invite':'decline_invite'})
    });
    setInvitations(items=>items.filter(item=>item.siteId!==invite.siteId));
    setNotice(accept?'Convite aceito. O monitor está em Meus sites.':'Convite recusado.');
  });

  return <section className="account-page" aria-label="Meu perfil">
    {error&&<p className="account-feedback is-error" role="alert">{error}</p>}
    {notice&&<p className="account-feedback" role="status">{notice}</p>}
    {!user ? <div className="account-panel">
      <h3>Entre para acessar seu perfil</h3>
      <button type="button" className="mine-primary" disabled={busy}
        onClick={()=>run(()=>signInWithPopup(auth,new GoogleAuthProvider()))}>Entrar com Google</button>
    </div> : !profile ? <p role="status">{error?'Perfil indisponível. Reabra Meu perfil para tentar novamente.':'Carregando perfil…'}</p> : <>
      <form className="account-panel account-form" onSubmit={submit}>
        <div className="account-identity"><AccountAvatar name={name} photo={photo===undefined?profile.photo:photo}/>
          <div><strong>{name}</strong><p>{profile.email}</p></div>
        </div>
        <div className="account-actions account-photo-actions">
          <input hidden ref={photoInput} aria-label="Foto do perfil" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy}
            onChange={event=>{const file=event.target.files[0];if(file)run(async()=>setPhoto(await resizePhoto(file)));event.target.value='';}}/>
          <button className="mine-quiet" type="button" disabled={busy} onClick={()=>photoInput.current?.click()}>
            {(photo===undefined?profile.photo:photo)?'Trocar foto':'Adicionar foto'}
          </button>
          {(photo===undefined?profile.photo:photo)&&<button className="mine-quiet" type="button" disabled={busy} onClick={()=>setPhoto(null)}>Remover foto</button>}
        </div>
        <label>Nome de exibição<input required minLength={2} maxLength={60} value={name} onChange={event=>setName(event.target.value)}/></label>
        <div className="account-actions">
          <button className="mine-primary" type="submit" disabled={busy||name.trim().length<2}>{busy?'Aguarde…':'Salvar perfil'}</button>
          <button className="mine-quiet" type="button" disabled={busy} onClick={()=>run(()=>signOut(auth))}>Sair</button>
        </div>
      </form>
      <section className="account-panel">
        <div className="account-heading"><h3>Convites recebidos</h3><button className="mine-quiet" type="button" onClick={onSites}>Meus sites</button></div>
        {invitations.length===0?<p>Nenhum convite pendente.</p>:<ul className="account-list">
          {invitations.map(invite=><li key={invite.siteId}>
            <div><strong>{invite.siteName}</strong><p>{roleLabels[invite.role]} · até {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</p></div>
            <div className="account-actions">
              <button type="button" className="mine-primary" disabled={busy} onClick={()=>respond(invite,true)}>Aceitar</button>
              <button type="button" className="mine-quiet" disabled={busy} onClick={()=>respond(invite,false)}>Recusar</button>
            </div>
          </li>)}
        </ul>}
      </section>
    </>}
  </section>;
}
