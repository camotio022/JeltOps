import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
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
  runId, kind: 'simulated-event', target: 'JeltOps Laboratory',
  url: '/api/lab-target', status, statusCode, eventType: kind,
  latencyMs: 0, dnsLookupMs: 0, tcpConnectMs: 0,
  timestamp: new Date(now), createdAt: FieldValue.serverTimestamp(),
  source: 'controlled-lab-immediate-check'
});

// Called on demand: start is committed atomically with baseline + DOWN records.
// No writes can be triggered without the authorized POST endpoint.
export async function startLab({ uid, code, verifyCode }) {
  const db = getLabDb();
  const ref = db.doc(LAB_REF);
  const now = Date.now();
  const runId = randomUUID();
  const observationToken = randomBytes(32).toString('hex');
  const observationTokenHash = createHash('sha256').update(observationToken).digest('hex');
  const state = { runId, startedAtMs: now, endsAtMs: now + LAB_DURATION_MS, recoveredLogged: false, observationTokenHash };
  const started = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().endsAtMs > now) throw new Error('lab_already_running');
    const valid = await verifyCode(tx, uid, code, now);
    if (!valid) return false;
    tx.set(ref, { ...state, presenterUid: uid });
    tx.create(db.doc(`lab_experiments/${runId}/events/baseline`), eventData(runId, 'BASELINE', 'UP', 200, now - 2));
    tx.create(db.doc(`lab_experiments/${runId}/events/down`), eventData(runId, 'SIMULATED_OUTAGE', 'DOWN', 503, now));
    return true;
  });
  if (!started) throw new Error('code_invalid');
  return { runId, startedAtMs: now, endsAtMs: now + LAB_DURATION_MS, status: 'DOWN', statusCode: 503, observationToken };
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
      tx.create(db.doc(`lab_experiments/${state.runId}/events/recovery`),
        eventData(state.runId, 'SIMULATED_RECOVERY', 'UP', 200, Date.now()));
    }
    return { ...resolved, runId: state?.runId ?? null,
      endsAt: state?.endsAtMs ? new Date(state.endsAtMs).toISOString() : null,
      startedAt: state?.startedAtMs ? new Date(state.startedAtMs).toISOString() : null };
  });
}

export async function recordLabObservation(runId, sample) {
  const db = getLabDb();
  const ref = db.doc('lab_experiments/' + runId + '/observations/' + sample.phaseKey);
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists) tx.create(ref, {
      runId, kind: 'independent-http-observation',
      status: sample.status, statusCode: sample.statusCode,
      latencyMs: sample.latencyMs, responseJson: sample.responseJson ?? null, observedAt: FieldValue.serverTimestamp(),
      observedAtMs: sample.observedAtMs, error: sample.error ?? null,
      phase: sample.phase
    });
  });
}

export async function getLabReport(runId) {
  const db = getLabDb();
  const [events,observations] = await Promise.all([
    db.collection('lab_experiments/' + runId + '/events').get(),
    db.collection('lab_experiments/' + runId + '/observations').get()
  ]);
  const convert = doc => {
    const { createdAt, observedAt, ...data } = doc.data();
    return { id: doc.id, ...data, timestamp: data.timestamp?.toDate?.()?.toISOString() ?? null };
  };
  return { runId, simulatedEvents: events.docs.map(convert), observedChecks: observations.docs.map(convert) };
}

export async function validateObservationToken(runId, token) {
  if (!runId || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const snap = await getLabDb().doc(LAB_REF).get();
  const data = snap.data();
  if (!data || data.runId !== runId || !data.observationTokenHash ||
      Date.now() > data.endsAtMs + 60_000) return false;
  return createHash('sha256').update(token).digest('hex') === data.observationTokenHash;
}
