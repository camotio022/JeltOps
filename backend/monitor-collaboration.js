import {getLabDb} from './lab-store.js';

const roles = ['operator', 'viewer'];
const invitationTTL = 7 * 24 * 60 * 60 * 1000;
const teamLimit = 10;
const db = () => getLabDb();
const monitors = () => db().collection('private_monitors');
const profiles = () => db().collection('monitor_profiles');
const normalizedEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const verifiedEmail = user => normalizedEmail(user.email);

export function monitorRole(monitor, uid) {
  if (!monitor || monitor.deleted) return null;
  if (monitor.ownerUid === uid) return 'owner';
  const role = monitor.members?.find(member => member.uid === uid)?.role;
  return roles.includes(role) ? role : null;
}

function reference(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9]{10,45}$/.test(id)) throw new Error('id_invalido');
  return monitors().doc(id);
}

function safeGooglePhoto(value) {
  return typeof value === 'string' && /^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(value) ? value : null;
}

export async function getProfile(user) {
  const saved = (await profiles().doc(user.uid).get()).data();
  return {
    name: saved?.name ?? ((typeof user.name === 'string' ? user.name.slice(0, 60) : '') || 'Minha conta'),
    photo: saved && 'photo' in saved ? saved.photo : safeGooglePhoto(user.picture),
    email: verifiedEmail(user)
  };
}

export async function saveProfile(user, input) {
  const name = typeof input?.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 60) throw new Error('perfil_nome_invalido');
  const patch = {name};
  if (input.photo !== undefined) {
    const photo = input.photo;
    if (photo !== null && (typeof photo !== 'string' || photo.length > 65_536 ||
        !/^data:image\/jpeg;base64,\/[a-zA-Z0-9+/]+={0,2}$/.test(photo))) throw new Error('foto_invalida');
    if (photo) {
      const bytes = Buffer.from(photo.split(',')[1], 'base64');
      if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 ||
          bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error('foto_invalida');
    }
    patch.photo = photo;
  }
  await profiles().doc(user.uid).set(patch, {merge:true});
  return getProfile(user);
}

export async function listInvitations(user) {
  const email = verifiedEmail(user);
  if (!email) return [];
  const results = await monitors().where('pendingEmails', 'array-contains', email).get();
  return results.docs.flatMap(doc => {
    const monitor = doc.data();
    const invite = monitor.pendingInvites?.find(item => item.email === email && item.expiresAt > Date.now());
    return monitor.deleted || !invite ? [] : [{siteId:doc.id, siteName:monitor.name, role:invite.role, expiresAt:invite.expiresAt}];
  });
}

export async function getMonitorTeam(user, id) {
  const monitor = (await reference(id).get()).data();
  const role = monitorRole(monitor, user.uid);
  if (!role) throw new Error('nao_encontrado');
  const members = [{uid:monitor.ownerUid, role:'owner', name:monitor.ownerName, photo:monitor.ownerPhoto},
    ...(monitor.members ?? [])];
  const snapshots = await db().getAll(...members.map(member => profiles().doc(member.uid)));
  return {
    role,
    members:members.map((member, index) => {
      const saved = snapshots[index].data();
      return {uid:member.uid, role:member.role, name:saved?.name || member.name || (member.role==='owner'?'Proprietário':'Membro'),
        photo:saved && 'photo' in saved ? saved.photo : member.photo ?? null};
    }),
    invitations:role==='owner' ? (monitor.pendingInvites ?? []).filter(item=>item.expiresAt>Date.now()) : []
  };
}

export async function changeTeam(user, id, body) {
  const ref = reference(id);
  const action = body?.action;
  const email = verifiedEmail(user);
  if (!email) throw new Error('permissao_monitor');
  const ownerProfile = action === 'invite' ? await getProfile(user) : null;
  return db().runTransaction(async tx => {
    const monitor = (await tx.get(ref)).data();
    if (!monitor || monitor.deleted) throw new Error('nao_encontrado');
    const role = monitorRole(monitor, user.uid);
    const now = Date.now();
    let members = monitor.members ?? [];
    let pending = (monitor.pendingInvites ?? []).filter(item => item.expiresAt > now);

    if (action === 'accept_invite' || action === 'decline_invite') {
      const invite = pending.find(item => item.email === email);
      if (!invite) throw new Error('convite_indisponivel');
      if (action === 'accept_invite' && !role) {
        if (members.length >= teamLimit) throw new Error('limite_equipe');
        members = [...members, {uid:user.uid,email,role:invite.role,
          name:typeof user.name === 'string' ? user.name.slice(0,60) : 'Membro',photo:safeGooglePhoto(user.picture)}];
      }
      pending = pending.filter(item => item.email !== email);
    } else if (action === 'leave_team') {
      if (!role || role === 'owner') throw new Error('permissao_monitor');
      members = members.filter(item => item.uid !== user.uid);
    } else {
      if (role !== 'owner') throw new Error('permissao_monitor');
      if (action === 'invite' || action === 'cancel_invite') {
        const target = normalizedEmail(body.email);
        if (target.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) throw new Error('email_convite_invalido');
        if (action === 'invite') {
          if (!roles.includes(body.role)) throw new Error('papel_invalido');
          if (target === email || members.some(item=>item.email===target) || pending.some(item=>item.email===target)) {
            throw new Error('convite_duplicado');
          }
          if (members.length + pending.length >= teamLimit) throw new Error('limite_equipe');
          pending = [...pending, {email:target,role:body.role,expiresAt:now+invitationTTL}];
        } else pending = pending.filter(item => item.email !== target);
      } else if (action === 'remove_member' || action === 'change_role') {
        const uid = body.memberUid;
        if (!members.some(item=>item.uid===uid)) throw new Error('nao_encontrado');
        if (action === 'change_role') {
          if (!roles.includes(body.role)) throw new Error('papel_invalido');
          members = members.map(item => item.uid===uid ? {...item,role:body.role} : item);
        } else members = members.filter(item=>item.uid!==uid);
      } else throw new Error('acao_invalida');
    }
    tx.update(ref, {
      members,memberUids:members.map(item=>item.uid),
      pendingInvites:pending,pendingEmails:pending.map(item=>item.email),
      ...(ownerProfile ? {ownerName:ownerProfile.name,ownerPhoto:safeGooglePhoto(user.picture)} : {})
    });
    return {ok:true};
  });
}
