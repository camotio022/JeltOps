import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { LAB_DURATION_MS, resolveLabState } from './lab-state.js';

const LAB_REF = 'lab_controls/current';
let firestore;

export function getLabDb() {
  if (firestore) return firestore;
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('lab_firestore_unavailable');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  firestore = getFirestore();
  return firestore;
}

const eventData = (runId, kind, status, statusCode, now) => ({
  runId, target: 'JeltOps Laboratory',
  url: '/api/lab-target', status, statusCode, eventType: kind,
  latencyMs: 0, dnsLookupMs: 0, tcpConnectMs: 0,
  timestamp: new Date(now), createdAt: FieldValue.serverTimestamp(),
  source: 'controlled-lab-immediate-check'
});

// Called on demand: start is committed atomically with baseline + DOWN records.
// No writes can be triggered without the authorized POST endpoint.
export async function startLab() {
  const db = getLabDb();
  const ref = db.doc(LAB_REF);
  const now = Date.now();
  const runId = randomUUID();
  const state = { runId, startedAtMs: now, endsAtMs: now + LAB_DURATION_MS, recoveredLogged: false };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().endsAtMs > now) throw new Error('lab_already_running');
    tx.set(ref, state);
    tx.create(db.collection('metrics_logs').doc(runId + '-baseline'), eventData(runId, 'BASELINE', 'UP', 200, now - 2));
    tx.create(db.collection('metrics_logs').doc(runId + '-down'), eventData(runId, 'DOWN_DETECTED', 'DOWN', 503, now));
  });
  return { ...state, status: 'DOWN', statusCode: 503 };
}

// Expired outage changes to HTTP200 regardless of browser availability.
// This function logs recovery exactly once on the first request after expiry.
// It may be called by dashboard polling or an external scheduler.
export async function getLabWithRecovery() {
  const db = getLabDb();
  const ref = db.doc(LAB_REF);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = snap.exists ? snap.data() : null;
    const resolved = resolveLabState(state);
    if (state && resolved.recovered && !state.recoveredLogged) {
      tx.update(ref, { recoveredLogged: true });
      tx.create(db.collection('metrics_logs').doc(state.runId + '-up'),
        eventData(state.runId, 'RECOVERY_DETECTED', 'UP', 200, Date.now()));
    }
    return { ...resolved, runId: state?.runId ?? null,
      endsAt: state?.endsAtMs ? new Date(state.endsAtMs).toISOString() : null,
      startedAt: state?.startedAtMs ? new Date(state.startedAtMs).toISOString() : null };
  });
}
