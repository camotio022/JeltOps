import {useState} from 'react';

export default function AccountAvatar({name, photo}) {
  const [failedPhoto,setFailedPhoto] = useState(null);
  const showPhoto = Boolean(photo && photo !== failedPhoto);
  const initials = (name || 'Minha conta').trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('');
  return <span className="account-avatar" aria-hidden="true">
    {showPhoto ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={()=>setFailedPhoto(photo)}/>
      : <span>{initials.toUpperCase()}</span>}
  </span>;
}
