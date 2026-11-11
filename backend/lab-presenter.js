import { randomInt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getVerifiedUser } from './private-monitors.js';
import { getLabDb } from './lab-store.js';

const TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const hashCode = (salt, code) => createHash('sha256').update(salt + ':' + code).digest('hex');
const challengeRef = uid => getLabDb().doc('lab_presenter_challenges/' + uid);

export async function requirePresenter(req) {
  const user = await getVerifiedUser(req);
  const grant = await getLabDb().doc('lab_presenters/' + user.uid).get();
  if (!grant.exists || grant.data().enabled !== true) throw new Error('presenter_forbidden');
  return user;
}

export async function issuePresenterCode(uid) {
  const code = String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString('hex');
  const ref = challengeRef(uid);
  const now = Date.now();
  await getLabDb().runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (doc.exists && now - (doc.data().lastIssuedAtMs || 0) < 30_000)
      throw new Error('code_cooldown');
    tx.set(ref, { hash: hashCode(salt, code), salt, expiresAtMs: now + TTL_MS,
      attempts: 0, lastIssuedAtMs: now, createdAt: FieldValue.serverTimestamp() });
  });
  // This confirms a Google-authenticated presenter; it is not a second factor.
  return { code, expiresAtMs: now + TTL_MS };
}

// Validate and consume in the same transaction as starting the outage.
export async function consumePresenterCode(tx, uid, code, now) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('code_invalid');
  const ref = challengeRef(uid);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new Error('code_invalid');
  const data = snap.data();
  if (data.expiresAtMs <= now || data.attempts >= MAX_ATTEMPTS)
    throw new Error('code_expired');
  const a = Buffer.from(data.hash, 'hex');
  const b = Buffer.from(hashCode(data.salt, code), 'hex');
  if (!timingSafeEqual(a, b)) {
    tx.update(ref, { attempts: FieldValue.increment(1) });
    return false;
  }
  tx.delete(ref);
  return true;
}
