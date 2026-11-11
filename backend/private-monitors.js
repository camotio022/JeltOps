import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getLabDb } from './lab-store.js';
import { normalizeMonitorUrl, probePublicSite } from './public-probe.js';
import { MAX_SITES_PER_USER, MAX_TOTAL_PRIVATE_SITES } from './monitor-policy.js';
import { shouldSaveCheck } from './check-persistence.js';

const coll = () => getLabDb().collection('private_monitors');
const counter = uid => getLabDb().doc('monitor_accounts/' + uid);
const globalCount = () => getLabDb().doc('system/private_monitor_quota');

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
  return {id:doc.id,name:x.name,url:x.url,enabled:x.enabled,createdAt:x.createdAt?.toDate?.()?.toISOString()||null};
}
export async function listMonitors(uid) {
  const all = await coll().where('ownerUid','==',uid).get();
  const active = all.docs.filter(d=>!d.data().deleted).map(publicMonitor).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  return active;
}
export async function createMonitor(uid, nameRaw, urlRaw) {
  const name=sanitizeName(nameRaw), url=normalizeMonitorUrl(urlRaw), db=getLabDb();
  const ref=coll().doc();
  await db.runTransaction(async tx=>{
    const c=counter(uid), g=globalCount();
    const [account,global]=await Promise.all([tx.get(c),tx.get(g)]);
    const used=account.data()?.activeCount||0, total=global.data()?.activeCount||0;
    if(used>=MAX_SITES_PER_USER) throw new Error('limite_por_usuario');
    if(total>=MAX_TOTAL_PRIVATE_SITES) throw new Error('limite_global');
    tx.set(ref,{ownerUid:uid,name,url,enabled:true,deleted:false,createdAt:FieldValue.serverTimestamp(),lastStatus:null});
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
  return {id:ref.id,name,url,enabled:true};
}
export async function changeMonitor(uid,id,action,body={}) {
  if(!/^[a-zA-Z0-9]{10,45}$/.test(id)) throw new Error('id_invalido');
  const db=getLabDb(),ref=coll().doc(id);
  let updated;
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists || snapshot.data().ownerUid!==uid || snapshot.data().deleted) throw new Error('nao_encontrado');
    const current=snapshot.data();
    if(action==='toggle'){
      updated={enabled:!current.enabled};
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
  if(action==='delete') {
    try { await db.recursiveDelete(ref); } catch(e) { console.error('private_monitor_cleanup',e.message); }
  }
  return updated;
}
export async function listSamples(uid,id) {
  if(!/^[a-zA-Z0-9]{10,45}$/.test(id)) throw new Error('id_invalido');
  const ref=coll().doc(id),doc=await ref.get();
  if(!doc.exists || doc.data().ownerUid!==uid || doc.data().deleted) throw new Error('nao_encontrado');
  const rows=await ref.collection('samples').orderBy('timestamp','desc').limit(40).get();
  return rows.docs.map(d=>({id:d.id,...d.data(),timestamp:d.data().timestamp?.toDate?.()?.toISOString()||null}));
}
export async function runPrivateMonitors() {
  const db=getLabDb();
  // Preserve the free-tier write quota while nobody has registered private sites.
  const quota=await globalCount().get();
  if(!(quota.data()?.activeCount>0)) return {skipped:true,reason:'sem_sites_particulares'};
  const lease=db.doc('system/private_monitor_scheduler');
  const now=Date.now();
  const claimed=await db.runTransaction(async tx=>{
    const d=await tx.get(lease);
    if(now-(d.data()?.lastStartedAtMs||0)<55_000) return false;
    tx.set(lease,{lastStartedAtMs:now},{merge:true});
    return true;
  });
  if(!claimed) return {skipped:true,reason:'verificacao_ja_realizada'};
  const snap=await coll().limit(MAX_TOTAL_PRIVATE_SITES+10).get();
  const active=snap.docs.filter(d=>d.data().enabled&&!d.data().deleted).slice(0,MAX_TOTAL_PRIVATE_SITES);
  // Concurrency bounded; do not abort the public-reference checks if one private site fails.
  let checked=0,saved=0;
  for(let i=0;i<active.length;i+=4) {
    const group=active.slice(i,i+4);
    await Promise.all(group.map(async doc=>{
      const ref=doc.ref,x=doc.data();
      try {
        const result=await probePublicSite(x.url);
        const latest=await ref.collection('samples').orderBy('timestamp','desc').limit(1).get();
        const previous=latest.empty?null:latest.docs[0].data();
        if(shouldSaveCheck(previous,result)){
          await ref.collection('samples').add({
            status:result.status,statusCode:result.statusCode,latencyMs:result.latencyMs,
            timestamp:FieldValue.serverTimestamp(),
            error:result.error||null
          });
          saved++;
        }
        checked++;
      }catch(e){console.error('[Monitor privado] Falha ao verificar alvo',doc.id,e.message)}
    }));
  }
  return {checked,saved};
}
