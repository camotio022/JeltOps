import { FieldPath, Timestamp } from 'firebase-admin/firestore';

export const referenceTargets = ['Google Endpoint', 'YouTube Main API'];
const events = ['all', 'down', 'recovered', 'up', 'unknown'];
const pageSize = 7;
const scanSize = 48;

export async function readCheckHistory(collection, params, { targets, serialize, classify }) {
  const { from, to, cursor, event = 'all', target = 'all' } = params;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end ||
      !events.includes(event) || (target !== 'all' && !targets?.includes(target))) {
    throw new Error('historico_invalido');
  }

  const ordered = collection.orderBy('timestamp', 'desc').orderBy(FieldPath.documentId(), 'desc');
  const byTarget = target === 'all' ? ordered : ordered.where('target', '==', target);
  let query = byTarget.where('timestamp', '>=', new Date(start)).where('timestamp', '<', new Date(end));
  if (cursor !== undefined) {
    const match = typeof cursor === 'string' && /^(\d{1,12}):(\d{1,9}):([\w-]{1,128})$/.exec(cursor);
    if (!match) throw new Error('historico_invalido');
    const seconds = Number(match[1]);
    const nanoseconds = Number(match[2]);
    if (seconds * 1000 + nanoseconds / 1e6 < start || seconds * 1000 + nanoseconds / 1e6 >= end) {
      throw new Error('historico_invalido');
    }
    const timestamp = new Timestamp(seconds, nanoseconds);
    query = query.startAfter(timestamp, match[3]);
  }

  const { docs } = await query.limit(scanSize + 1).get();
  const rows = docs.map(doc => ({ doc, data: doc.data() }));
  const matchesTarget = data => !targets || (targets.includes(data.target) && (target === 'all' || data.target === target));
  const samples = [];
  let consumed = 0;

  for (const { doc, data } of rows.slice(0, scanSize)) {
    consumed++;
    if (!matchesTarget(data)) continue;
    const state = classify(data);
    if (event === 'recovered') {
      if (state !== 'up') continue;
      // Inspect the previous saved check for this target, including before the selected period.
      const older = rows.slice(consumed).find(row => !targets || row.data.target === data.target);
      let previous = older?.data;
      if (!previous) {
        const sameTarget = targets ? ordered.where('target', '==', data.target) : ordered;
        const result = await sameTarget.startAfter(data.timestamp, doc.id).limit(1).get();
        previous = result.docs[0]?.data();
      }
      if (!previous || classify(previous) !== 'down') continue;
    } else if (event !== 'all' && state !== event) {
      continue;
    }
    samples.push({ ...serialize(doc), recovered: event === 'recovered' });
    if (samples.length === pageSize) break;
  }

  const last = rows[consumed - 1];
  const nextCursor = consumed < rows.length && last
    ? [last.data.timestamp.seconds, last.data.timestamp.nanoseconds, last.doc.id].join(':')
    : null;
  return { samples, nextCursor };
}
