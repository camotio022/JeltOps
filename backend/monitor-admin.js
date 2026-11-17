import {getAuth} from 'firebase-admin/auth';
import {getLabDb} from './lab-store.js';
import {MAX_TOTAL_PRIVATE_SITES,PRIVATE_CHECK_INTERVAL_MS,privateSchedulerPath} from './monitor-policy.js';

const week = 7 * 24 * 60 * 60 * 1000;
const lateAfter = 3 * PRIVATE_CHECK_INTERVAL_MS;

export function canAdminister(user) {
  const uid = process.env.JELTOPS_ADMIN_UID?.trim();
  return Boolean(uid && user?.uid === uid && user.email_verified === true &&
    user.firebase?.sign_in_provider === 'google.com');
}

function timestamp(value) {
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

async function listAccounts() {
  const accounts = [];
  let pageToken;
  do {
    const page = await getAuth().listUsers(1000,pageToken);
    for (const user of page.users) {
      accounts.push({
        uid:user.uid,name:user.displayName || null,email:user.email || null,disabled:user.disabled,
        lastSignInAt:timestamp(user.metadata.lastSignInTime),
        lastActivityAt:timestamp(user.metadata.lastRefreshTime) ?? timestamp(user.metadata.lastSignInTime)
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return accounts.sort((a,b)=>(b.lastActivityAt ?? 0)-(a.lastActivityAt ?? 0));
}

function domain(url) {
  try {return new URL(url).hostname;}
  catch {return 'Domínio indisponível';}
}

export async function readAdminOverview() {
  const db = getLabDb();
  const [accounts,docs,scheduleDoc] = await Promise.all([
    listAccounts(),
    db.collection('private_monitors').where('deleted','==',false).limit(MAX_TOTAL_PRIVATE_SITES).get(),
    db.doc(privateSchedulerPath).get()
  ]);
  const schedule = scheduleDoc.data() ?? {};
  const now = Date.now();
  const identities = new Map(accounts.map(account=>[account.uid,account]));
  const monitors = docs.docs.map(doc=>{
    const monitor = doc.data();
    const last = schedule.checks?.[doc.id];
    const createdAt = monitor.createdAt?.toMillis?.() ?? null;
    const deadlineBase = last?.at ?? createdAt;
    const owner = identities.get(monitor.ownerUid);
    return {
      id:doc.id,domain:domain(monitor.url),enabled:monitor.enabled===true,
      owner:owner?.name || owner?.email || 'Conta indisponível',
      lastCheckAt:last?.at ?? null,lastStatus:last?.status ?? monitor.lastAlertStatus ?? null,
      overdue:monitor.enabled===true && deadlineBase!==null && now-deadlineBase>lateAfter
    };
  });
  const activeMonitors = monitors.filter(site=>site.enabled).length;
  return {
    summary:{activeUsers:accounts.filter(account=>!account.disabled && account.lastActivityAt!==null && now-account.lastActivityAt<=week).length,
      activeMonitors,overdueMonitors:monitors.filter(site=>site.overdue).length},
    operation:{
      lastStartedAt:schedule.lastStartedAtMs ?? null,lastCompletedAt:schedule.lastCompletedAtMs ?? null,
      lastFailureAt:schedule.lastFailureAtMs ?? null,lastFailureCount:schedule.lastFailureCount ?? 0,
      runFailures:schedule.runFailures ?? 0,
      overdue:activeMonitors>0 && (!schedule.lastCompletedAtMs || now-schedule.lastCompletedAtMs>lateAfter),
      lateAfterMinutes:lateAfter/60_000
    },
    accounts,monitors
  };
}
