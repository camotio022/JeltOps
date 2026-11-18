import { readCheckHistory } from './check-history.js';
import {listMonitorActivity, notifyMonitorActivity, recordMonitorActivity} from './monitor-notifications.js';
import {getProfile, monitorRole} from './monitor-collaboration.js';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getLabDb } from './lab-store.js';
import { normalizeMonitorUrl, probePublicSite } from './public-probe.js';
import { MAX_SITES_PER_USER, MAX_TOTAL_PRIVATE_SITES, privateSchedulerPath } from './monitor-policy.js';
import { shouldSaveCheck } from './check-persistence.js';

const coll = () => getLabDb().collection('private_monitors');
const counter = uid => getLabDb().doc('monitor_accounts/' + uid);
const globalCount = () => getLabDb().doc('system/private_monitor_quota');
export const MONITOR_METRICS = ['status','latency','success','http','lastCheck','sampleCount'];
export const DEFAULT_METRICS = ['status','latency','success'];
export function validateMonitorMetrics(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 6 ||
      new Set(input).size !== input.length ||
      !input.every(x => typeof x === 'string' && MONITOR_METRICS.includes(x))) throw new Error('indicadores_invalidos');
  return input;
}
function serializeSample(doc) {
  const v=doc.data();
  return {id:doc.id,...v,timestamp:v.timestamp?.toDate?.()?.toISOString()||null};
}

export async function getVerifiedUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ') || header.length > 6000) throw new Error('nao_autorizado');
  getLabDb();
  const claims = await getAuth().verifyIdToken(header.slice(7), true);
  if (!claims.uid || claims.firebase?.sign_in_provider !== 'google.com' || claims.email_verified !== true) throw new Error('nao_autorizado');
  return claims;
}
export function sanitizeName(input) {
  if (typeof input !== 'string') throw new Error('nome_invalido');
  const name = input.trim().replace(/\s+/g,' ');
  if (name.length < 3 || name.length > 60) throw new Error('nome_invalido');
  return name;
}
export function publicMonitor(doc) {
  const x=doc.data();
  return {id:doc.id,name:x.name,url:x.url,enabled:x.enabled,metrics:x.metrics||DEFAULT_METRICS,createdAt:x.createdAt?.toDate?.()?.toISOString()||null};
}
export async function listMonitors(uid) {
  const [owned, shared] = await Promise.all([
    coll().where('ownerUid','==',uid).get(),
    coll().where('memberUids','array-contains',uid).get()
  ]);
  return [...new Map([...owned.docs,...shared.docs].map(doc=>[doc.id,doc])).values()]
    .flatMap(doc=>{
      const value = doc.data();
      const role = monitorRole(value, uid);
      return role ? [{...publicMonitor(doc),role,memberCount:1+(value.members?.length??0)}] : [];
    })
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
export async function createMonitor(uid, nameRaw, urlRaw) {
  const name=sanitizeName(nameRaw), url=normalizeMonitorUrl(urlRaw), db=getLabDb();
  const ref=coll().doc();
  await db.runTransaction(async tx=>{
    const c=counter(uid), g=globalCount();
    const owners = coll().where('ownerUid','==',uid);
    const [account,global,existing]=await Promise.all([tx.get(c),tx.get(g),tx.get(owners)]);
    const duplicate = existing.docs.some(doc => {
      const monitor = doc.data();
      if (monitor.deleted) return false;
      try { return normalizeMonitorUrl(monitor.url) === url; }
      catch { return false; }
    });
    if (duplicate) throw new Error('url_duplicada');
    const used=account.data()?.activeCount||0, total=global.data()?.activeCount||0;
    if(used>=MAX_SITES_PER_USER) throw new Error('limite_por_usuario');
    if(total>=MAX_TOTAL_PRIVATE_SITES) throw new Error('limite_global');
    tx.set(ref,{ownerUid:uid,name,url,enabled:true,deleted:false,metrics:DEFAULT_METRICS,createdAt:FieldValue.serverTimestamp(),lastStatus:null});
    tx.set(c,{activeCount:used+1},{merge:true});
    tx.set(g,{activeCount:total+1},{merge:true});
  });
  // First measured sample is immediate so newly registered sites can be tested
  // without waiting for the external scheduler's next tick.
  try {
    const first = await probePublicSite(url);
    await ref.collection('samples').add({
      status:first.status,statusCode:first.statusCode,latencyMs:first.latencyMs,
      timestamp:FieldValue.serverTimestamp(),error:first.error||null
    });
  } catch(error) {
    console.error('[Meus sites] Primeira verificação:',error.message);
  }
  return {id:ref.id,name,url,enabled:true,metrics:DEFAULT_METRICS};
}
export async function changeMonitor(user,id,action,body={}) {
  const uid = user.uid;
  if(!/^[a-zA-Z0-9]{10,45}$/.test(id)) throw new Error('id_invalido');
  const db=getLabDb(),ref=coll().doc(id);
  const actorName = action === 'toggle' ? (await getProfile(user)).name : null;
  let updated;
  const activity = await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists || snapshot.data().ownerUid!==uid || snapshot.data().deleted) throw new Error('nao_encontrado');
    const current=snapshot.data();
    if(action==='toggle'){
      updated={enabled:typeof body.enabled === 'boolean' ? body.enabled : !current.enabled};
      if (updated.enabled !== current.enabled) {
        tx.update(ref,updated);
        return recordMonitorActivity(tx,ref,current,updated.enabled?'resumed':'paused',actorName,{actorUid:uid});
      }
    } else if(action==='configure') {
      updated={metrics:validateMonitorMetrics(body.metrics)};
      tx.update(ref,updated);
    } else if(action==='rename') {
      updated={name:sanitizeName(body.name)};
      tx.update(ref,updated);
    } else if(action==='delete') {
      const c=counter(uid),g=globalCount();
      const [account,global]=await Promise.all([tx.get(c),tx.get(g)]);
      tx.update(ref,{enabled:false,deleted:true,deletedAt:FieldValue.serverTimestamp()});
      tx.set(c,{activeCount:Math.max(0,(account.data()?.activeCount||1)-1)},{merge:true});
      tx.set(g,{activeCount:Math.max(0,(global.data()?.activeCount||1)-1)},{merge:true});
      updated={deleted:true};
    } else throw new Error('acao_invalida');
  });
  await notifyMonitorActivity(activity);
  if(action==='delete') {
    try { await db.recursiveDelete(ref); } catch(e) { console.error('private_monitor_cleanup',e.message); }
  }
  return updated;
}
export async function listSamples(uid,id,historyParams) {
  if(!/^[a-zA-Z0-9]{10,45}$/.test(id)) throw new Error('id_invalido');
  const ref=coll().doc(id),doc=await ref.get();
  if(!monitorRole(doc.data(),uid)) throw new Error('nao_encontrado');
  if (historyParams) {
    return readCheckHistory(ref.collection('samples'), historyParams, {
      serialize: serializeSample,
      classify: data => !Number(data.statusCode) ? 'unknown' :
        data.status === 'UP' ? 'up' : data.status === 'DOWN' ? 'down' : 'unknown'
    });
  }
  const rows=await ref.collection('samples').orderBy('timestamp','desc').limit(40).get();
  return {samples:rows.docs.map(serializeSample),activity:await listMonitorActivity(ref)};
}
export async function runManualCheck(user,id) {
  if(!/^[a-zA-Z0-9]{10,45}$/.test(id)) throw new Error('id_invalido');
  const ref=coll().doc(id), now=Date.now();
  // Atomic rate limit: user may ask for one independent check every 60 seconds.
  const {name} = await getProfile(user);
  let url;
  await getLabDb().runTransaction(async tx=>{
    const doc=await tx.get(ref);
    const role = monitorRole(doc.data(), user.uid);
    if(!role) throw new Error('nao_encontrado');
    if(role==='viewer') throw new Error('permissao_monitor');
    if(!doc.data().enabled) throw new Error('monitor_pausado');
    if(now-(doc.data().lastManualCheckAtMs||0)<60_000) throw new Error('aguarde_um_minuto');
    url=doc.data().url;
    tx.update(ref,{lastManualCheckAtMs:now});
  });
  const probe=await probePublicSite(url);
  const item={status:probe.status,statusCode:probe.statusCode,latencyMs:probe.latencyMs,
    timestamp:FieldValue.serverTimestamp(),error:probe.error||null,source:'manual',actorName:name};
  const activity = await getLabDb().runTransaction(async tx=>{
    const monitor = (await tx.get(ref)).data();
    if (!monitor?.enabled || !monitorRole(monitor,user.uid)) throw new Error('monitor_pausado');
    tx.create(ref.collection('samples').doc(),item);
    return recordMonitorActivity(tx,ref,monitor,'manualCheck',name,{history:false,
      recipients:[monitor.ownerUid,...(monitor.memberUids ?? [])].filter(uid=>uid!==user.uid)});
  });
  await notifyMonitorActivity(activity);
  return {status:probe.status,statusCode:probe.statusCode,latencyMs:probe.latencyMs,error:probe.error||null};
}

export async function runPrivateMonitors() {
  const db=getLabDb();
  // Preserve the free-tier write quota while nobody has registered private sites.
  const quota=await globalCount().get();
  if(!(quota.data()?.activeCount>0)) return {skipped:true,reason:'sem_sites_particulares'};
  const lease=db.doc(privateSchedulerPath);
  const now=Date.now();
  const claimed=await db.runTransaction(async tx=>{
    const d=await tx.get(lease);
    if(now-(d.data()?.lastStartedAtMs||0)<55_000) return false;
    tx.set(lease,{lastStartedAtMs:now,previousStartedAtMs:d.data()?.lastStartedAtMs ?? null},{merge:true});
    return true;
  });
  if(!claimed) return {skipped:true,reason:'verificacao_ja_realizada'};
  let checked=0,saved=0,failures=0;
  const checks={};
  try {
    // Query only active records: deleted documents cannot crowd out valid sites.
    const snap=await coll().where('deleted','==',false).limit(MAX_TOTAL_PRIVATE_SITES).get();
    const active=snap.docs.filter(d=>d.data().enabled).slice(0,MAX_TOTAL_PRIVATE_SITES);
    // Concurrency bounded; do not abort the public-reference checks if one private site fails.
    for(let i=0;i<active.length;i+=4) {
      const group=active.slice(i,i+4);
      await Promise.all(group.map(async doc=>{
        const ref=doc.ref,x=doc.data();
        try {
          const result=await probePublicSite(x.url);
          const latest=await ref.collection('samples').orderBy('timestamp','desc').limit(1).get();
          const previous=latest.empty?null:latest.docs[0].data();
          const saveSample = shouldSaveCheck(previous,result);
          if (saveSample || result.status !== x.lastAlertStatus) {
            const outcome = await db.runTransaction(async tx=>{
              const monitor = (await tx.get(ref)).data();
              if (!monitor?.enabled || monitor.deleted) return null;
              const previousStatus = monitor.lastAlertStatus ?? previous?.status;
              let kind;
              if (result.status !== previousStatus) {
                if (result.status === 'DOWN') kind = 'down';
                if (result.status === 'UNKNOWN') kind = 'unknown';
                if (result.status === 'UP' && ['DOWN','UNKNOWN'].includes(previousStatus)) kind = 'recovered';
              }
              if (monitor.lastAlertStatus !== result.status) tx.update(ref,{lastAlertStatus:result.status});
              if (saveSample) tx.create(ref.collection('samples').doc(),{
                status:result.status,statusCode:result.statusCode,latencyMs:result.latencyMs,
                timestamp:FieldValue.serverTimestamp(),error:result.error||null
              });
              const activity = kind ? recordMonitorActivity(tx,ref,monitor,kind,null) : null;
              return {activity,saved:saveSample};
            });
            if (outcome?.saved) saved++;
            await notifyMonitorActivity(outcome?.activity);
          }
          checks[doc.id]={at:Date.now(),status:result.status};
          checked++;
        }catch(e){
          failures++;
          console.error('[Monitor privado] Falha ao verificar alvo',doc.id,e.message);
        }
      }));
    }
  } catch (error) {
    failures++;
    throw error;
  } finally {
    const finishedAt = Date.now();
    await db.runTransaction(async tx=>{
      const current = (await tx.get(lease)).data();
      if (current?.lastStartedAtMs !== now) return;
      const previousChecks = current.checks ?? {};
      const recentChecks = Object.fromEntries(Object.entries(previousChecks)
        .filter(([,check])=>finishedAt-check.at<24*60*60*1000));
      tx.update(lease,{
        lastCompletedAtMs:finishedAt,checks:{...recentChecks,...checks},runFailures:failures,
        ...(failures ? {lastFailureAtMs:finishedAt,lastFailureCount:failures} : {})
      });
    });
  }
  return {checked,saved};
}
