import {allowsNotification,normalizePreferences,notificationCategories,notificationModes} from '../shared/notification-preferences.js';
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

async function deliver(doc, config, message) {
  try {
    await sendNotification(doc.data().subscription, JSON.stringify(message ??
      {title:'Notificações do JeltOps',body:'O teste chegou neste dispositivo.',tag:'jeltops-test'}),
    {vapidDetails:config,TTL:300,timeout:4000});
    return true;
  } catch (error) {
    if ([404,410].includes(error.statusCode)) {
      await doc.ref.delete({lastUpdateTime:doc.updateTime}).catch(()=>{});
    }
    return false;
  }
}

const pushTitles = {
  inviteAccepted:'Convite aceito', inviteDeclined:'Convite recusado',
  paused:'Monitor pausado', resumed:'Monitor reativado',
  down:'Serviço indisponível', recovered:'Serviço recuperado', unknown:'Verificação inconclusiva',
  manualCheck:'Verificação manual'
};

async function notifyDevices(field, values, kind, message) {
  const config = pushConfig();
  if (!config || values.length === 0) return;
  try {
    const results = await Promise.all(values.map(value=>devices().where(field,'==',value).limit(10).get()));
    const subscriptions = results.flatMap(result=>result.docs);
    const uids = [...new Set(subscriptions.map(doc=>doc.data().uid))];
    const preferences = new Map(await Promise.all(uids.map(async uid=>[uid,await getNotificationPreferences(uid)])));
    await Promise.all(subscriptions.filter(doc=>allowsNotification(preferences.get(doc.data().uid),kind,'push'))
      .map(doc=>deliver(doc,config,message)));
  } catch (error) {
    console.error('[JeltOps] Falha no envio por push',error.code);
  }
}

export function notifyInvitation(email,siteId) {
  return notifyDevices('emailKey',[hash(email)],'invitation',{title:'Novo convite no JeltOps',
    body:'Abra as notificações para ver o convite.',tag:'jeltops-invite-'+siteId,siteId});
}

export function notifyMonitorActivity(activity) {
  const title = pushTitles[activity?.kind];
  if (!title) return;
  return notifyDevices('uid',activity.pushRecipients,activity.kind,{title:title+' · JeltOps',
    body:'Abra o JeltOps para ver os detalhes.',tag:'jeltops-activity-'+activity.id,
    activityId:activity.id});
}

export function recordMonitorActivity(tx, ref, monitor, kind, actorName, options = {}) {
  const activity = ref.collection('activity').doc();
  const event = {siteId:ref.id,siteName:monitor.name,actorName,kind,at:Date.now()};
  const recipients = [...new Set(options.recipients ?? [monitor.ownerUid,...(monitor.memberUids ?? [])])];
  if (options.history !== false) tx.create(activity,event);
  for (const uid of recipients) {
    tx.create(inbox(uid).collection('activity').doc(activity.id),event);
  }
  return {id:activity.id,kind,pushRecipients:recipients.filter(uid=>uid!==options.actorUid)};
}

const activityRows = result => result.docs.map(doc=>({id:doc.id,...doc.data()}));

export async function listMonitorActivity(ref) {
  return activityRows(await ref.collection('activity').orderBy('at','desc').limit(20).get());
}

export async function getNotificationPreferences(uid) {
  return normalizePreferences((await inbox(uid).get()).data()?.preferences);
}

export async function saveNotificationPreferences(uid, value) {
  if (!value || Object.keys(value).length !== notificationCategories.length ||
      !notificationCategories.every(({id})=>typeof value[id]==='string' && Object.hasOwn(notificationModes,value[id]))) {
    throw new Error('preferencias_invalidas');
  }
  const preferences = normalizePreferences(value);
  await inbox(uid).set({preferences},{merge:true});
  return preferences;
}

export async function readInbox(uid, activityId) {
  const ref = inbox(uid);
  const data = (await ref.get()).data();
  const preferences = normalizePreferences(data?.preferences);
  const kinds = notificationCategories.flatMap(category=>category.kinds)
    .filter(kind=>kind!=='invitation'&&allowsNotification(preferences,kind,'inbox'));
  const events = ref.collection('activity');
  const [rows,focus] = await Promise.all([
    kinds.length ? events.orderBy('at','desc').limit(30).get() : null,
    typeof activityId==='string' && /^[a-zA-Z0-9]{20}$/.test(activityId) ? events.doc(activityId).get() : null
  ]);
  return {activity:rows ? activityRows(rows).filter(event=>kinds.includes(event.kind)).slice(0,30) : [],readThrough:data?.readThrough ?? 0,
    showInvitations:allowsNotification(preferences,'invitation','inbox'),
    focusedActivity:focus?.exists ? {id:focus.id,...focus.data()} : null};
}

export async function markInboxRead(uid, at) {
  if (!Number.isSafeInteger(at) || at < 0 || at > Date.now()) throw new Error('acao_invalida');
  const ref = inbox(uid);
  await getLabDb().runTransaction(async tx => {
    if (at > ((await tx.get(ref)).data()?.readThrough ?? 0)) tx.set(ref,{readThrough:at},{merge:true});
  });
}
