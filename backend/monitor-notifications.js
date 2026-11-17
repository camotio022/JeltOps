import {createHash} from 'node:crypto';
import {sendNotification} from 'web-push';
import {getLabDb} from './lab-store.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const devices = () => getLabDb().collection('monitor_push_devices');
const inbox = uid => getLabDb().collection('monitor_inboxes').doc(uid);
const pushConfig = () => {
  const {WEB_PUSH_PUBLIC_KEY:publicKey, WEB_PUSH_PRIVATE_KEY:privateKey, WEB_PUSH_SUBJECT:subject} = process.env;
  return publicKey && privateKey && subject ? {publicKey,privateKey,subject} : null;
};

function endpointRef(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('dispositivo_invalido'); }
  const supported = ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com',
    'android.googleapis.com'].includes(url.hostname) ||
    url.hostname.endsWith('.web.push.apple.com') || url.hostname.endsWith('.notify.windows.com');
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !supported || url.protocol !== 'https:' ||
      url.port || url.username || url.password || url.hash) throw new Error('dispositivo_invalido');
  return devices().doc(hash(endpoint));
}

export async function pushDevice(user, body) {
  const config = pushConfig();
  const action = body?.action;
  if (action === 'status') {
    const device = body.endpoint ? (await endpointRef(body.endpoint).get()).data() : null;
    return {publicKey:config?.publicKey ?? null, active:device?.uid === user.uid,
      occupied:Boolean(device && device.uid !== user.uid)};
  }
  const subscription = body.subscription;
  const endpoint = action === 'enable' ? subscription?.endpoint : body.endpoint;
  const ref = endpointRef(endpoint);
  if (action === 'enable') {
    if (!config) throw new Error('push_indisponivel');
    const {p256dh,auth} = subscription.keys ?? {};
    if (!/^[\w-]{87}$/.test(p256dh ?? '') || !/^[\w-]{22}$/.test(auth ?? '')) throw new Error('dispositivo_invalido');
    await getLabDb().runTransaction(async tx => {
      const saved = (await tx.get(ref)).data();
      if (saved && saved.uid !== user.uid) throw new Error('dispositivo_em_uso');
      tx.set(ref,{uid:user.uid,emailKey:hash(user.email.trim().toLowerCase()),subscription:{endpoint,keys:{p256dh,auth}}},{merge:true});
    });
  } else if (action === 'disable') {
    await getLabDb().runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.uid === user.uid) tx.delete(ref);
    });
  } else if (action === 'test') {
    if (!config) throw new Error('push_indisponivel');
    await getLabDb().runTransaction(async tx => {
      const device = (await tx.get(ref)).data();
      if (device?.uid !== user.uid) throw new Error('dispositivo_invalido');
      if (Date.now() - (device.lastTestAt ?? 0) < 30_000) throw new Error('push_teste_intervalo');
      tx.update(ref,{lastTestAt:Date.now()});
    });
    const device = await ref.get();
    if (device.data()?.uid !== user.uid) throw new Error('dispositivo_invalido');
    if (!(await deliver(device,config))) throw new Error('push_falhou');
  } else throw new Error('acao_invalida');
  return {ok:true};
}

async function deliver(doc, config, siteId) {
  try {
    await sendNotification(doc.data().subscription, JSON.stringify(!siteId ?
      {title:'Notificações do JeltOps',body:'O teste chegou neste dispositivo.',tag:'jeltops-test'} :
      {title:'Novo convite no JeltOps',body:'Abra as notificações para ver o convite.',tag:'jeltops-invite-'+siteId,siteId}),
    {vapidDetails:config,TTL:300,timeout:4000});
    return true;
  } catch (error) {
    if ([404,410].includes(error.statusCode)) {
      await doc.ref.delete({lastUpdateTime:doc.updateTime}).catch(()=>{});
    }
    return false;
  }
}

export async function notifyInvitation(email,siteId) {
  const config = pushConfig();
  if (!config) return;
  try {
    const result = await devices().where('emailKey','==',hash(email)).limit(10).get();
    await Promise.all(result.docs.map(doc=>deliver(doc,config,siteId)));
  } catch (error) {
    console.error('[JeltOps] Falha no envio de convite por push',error.code);
  }
}

export function recordMonitorActivity(tx, ref, monitor, actorName, enabled) {
  const activity = ref.collection('activity').doc();
  const event = {siteId:ref.id,siteName:monitor.name,actorName,
    kind:enabled?'resumed':'paused',at:Date.now()};
  tx.create(activity,event);
  for (const uid of new Set([monitor.ownerUid,...(monitor.memberUids ?? [])])) {
    tx.create(inbox(uid).collection('activity').doc(activity.id),event);
  }
}

const activityRows = result => result.docs.map(doc=>({id:doc.id,...doc.data()}));

export async function listMonitorActivity(ref) {
  return activityRows(await ref.collection('activity').orderBy('at','desc').limit(20).get());
}

export async function readInbox(uid) {
  const ref = inbox(uid);
  const [meta,rows] = await Promise.all([ref.get(),ref.collection('activity').orderBy('at','desc').limit(30).get()]);
  return {activity:activityRows(rows), readThrough:meta.data()?.readThrough ?? 0};
}

export async function markInboxRead(uid, at) {
  if (!Number.isSafeInteger(at) || at < 0 || at > Date.now()) throw new Error('acao_invalida');
  const ref = inbox(uid);
  await getLabDb().runTransaction(async tx => {
    if (at > ((await tx.get(ref)).data()?.readThrough ?? 0)) tx.set(ref,{readThrough:at},{merge:true});
  });
}
