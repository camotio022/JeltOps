export const MAX_SITES_PER_USER = 3;
export const MAX_TOTAL_PRIVATE_SITES = 50;
export const MAX_PRIVATE_CHECKS_PER_RUN = 50;
export const PRIVATE_CHECK_INTERVAL_MS = 60_000;
export function isDue(lastCheckedAt, now=Date.now()) {
  return !Number.isFinite(lastCheckedAt) || now-lastCheckedAt >= PRIVATE_CHECK_INTERVAL_MS-5000;
}
export function summarizeSamples(items) {
  const rows = items.filter(x => x && (x.status==='UP'||x.status==='DOWN'));
  const avg = rows.length ? Math.round(rows.reduce((sum,x)=>sum+Number(x.latencyMs||0),0)/rows.length) : null;
  const up = rows.length ? Math.round(rows.filter(x=>x.status==='UP').length/rows.length*1000)/10 : null;
  return { sampleCount: rows.length, upSamplePercent: up, avgLatencyMs: avg };
}
