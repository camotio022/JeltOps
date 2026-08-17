import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import { recordMetric } from './prometheus-exporter.js';
import { indexMetric } from './elastic-exporter.js';
import { initSentry, recordHealthCheck as sentryRecordHealthCheck } from './sentry-exporter.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

if (process.env.SENTRY_DSN) {
  initSentry(process.env.SENTRY_DSN);
}

const targets = [
  { name: 'YouTube Main API', url: 'https://www.youtube.com' },
  { name: 'Google Endpoint', url: 'https://www.google.com' }
];

function toFixedNumber(value, digits = 2) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return Number(safeValue.toFixed(digits));
}

function getRuntimeSnapshot() {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();

  return {
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      hostname: os.hostname(),
      uptimeSeconds: toFixedNumber(process.uptime()),
      cpuUserMs: toFixedNumber(cpu.user / 1000),
      cpuSystemMs: toFixedNumber(cpu.system / 1000),
      memoryRssMb: toFixedNumber(memory.rss / (1024 * 1024)),
      heapUsedMb: toFixedNumber(memory.heapUsed / (1024 * 1024)),
      heapTotalMb: toFixedNumber(memory.heapTotal / (1024 * 1024)),
      externalMb: toFixedNumber(memory.external / (1024 * 1024)),
      arrayBuffersMb: toFixedNumber(memory.arrayBuffers / (1024 * 1024))
    },
    serverRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.REGION || 'unknown',
    serverEnvironment: process.env.ENVIRONMENT || 'unknown'
  };
}

async function detectPublicIp() {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return 'unknown';
    }

    const payload = await response.json();
    return payload.ip || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

async function detectServerLocation(ip) {
  if (!ip || ip === 'unknown') {
    return {
      city: 'unknown',
      region: 'unknown',
      country: 'unknown',
      timezone: 'unknown',
      org: 'unknown'
    };
  }

  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      method: 'GET',
      signal: AbortSignal.timeout(7000)
    });

    if (!response.ok) {
      throw new Error('location_unavailable');
    }

    const payload = await response.json();
    return {
      city: payload.city || 'unknown',
      region: payload.region || payload.region_code || 'unknown',
      country: payload.country_name || payload.country || 'unknown',
      timezone: payload.timezone || 'unknown',
      org: payload.org || 'unknown',
      latitude: payload.latitude || null,
      longitude: payload.longitude || null
    };
  } catch (error) {
    return {
      city: 'unknown',
      region: 'unknown',
      country: 'unknown',
      timezone: 'unknown',
      org: 'unknown'
    };
  }
}

async function resolveDns(hostname) {
  const startedAt = performance.now();

  try {
    const address = await dns.lookup(hostname, { verbatim: true });
    return {
      dnsLookupMs: toFixedNumber(performance.now() - startedAt),
      resolvedAddress: address?.address || hostname,
      dnsStatus: 'ok'
    };
  } catch (error) {
    return {
      dnsLookupMs: toFixedNumber(performance.now() - startedAt),
      resolvedAddress: hostname,
      dnsStatus: 'error',
      dnsError: error.message
    };
  }
}

async function measureTcpConnection(hostname, port) {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port });
    let completed = false;

    const finish = (connected, detail = 'ok') => {
      if (completed) return;
      completed = true;
      socket.destroy();
      resolve({
        tcpConnectMs: toFixedNumber(performance.now() - startedAt),
        tcpConnected: connected,
        tcpDetail: detail
      });
    };

    socket.setTimeout(5000);
    socket.once('connect', () => finish(true, 'connected'));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (error) => finish(false, error.message));
  });
}

async function getExecutionContext() {
  const publicIp = await detectPublicIp();
  const location = await detectServerLocation(publicIp);

  return {
    publicIp,
    serverLocation: location,
    execution: {
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.REGION || 'unknown',
      hostname: os.hostname(),
      environment: process.env.ENVIRONMENT || 'local'
    },
    runtime: getRuntimeSnapshot().runtime
  };
}

async function runCheck(target) {
  console.log(`[Monitor] Verificando alvo: ${target.name}...`);
  const startTime = Date.now();
  const targetUrl = new URL(target.url);
  const hostname = targetUrl.hostname;
  const port = Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));

  let status = 'DOWN';
  let statusCode = 0;
  let latency = 0;
  let dnsData = { dnsLookupMs: 0, resolvedAddress: hostname, dnsStatus: 'unknown' };
  let tcpData = { tcpConnectMs: 0, tcpConnected: false, tcpDetail: 'not_started' };

  try {
    dnsData = await resolveDns(hostname);
    tcpData = await measureTcpConnection(hostname, port);

    const response = await fetch(target.url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent': 'JeltOps/1.0 Monitor'
      }
    });

    statusCode = response.status;
    status = response.ok || statusCode < 400 ? 'UP' : 'DOWN';
    latency = Date.now() - startTime;
  } catch (error) {
    latency = Date.now() - startTime;
    status = 'DOWN';
    statusCode = 500;
    console.warn(`[Monitor] Falha ao verificar ${target.name}: ${error.message}`);
  }

  const executionContext = await getExecutionContext();
  const logsRef = db.collection('metrics_logs');
  const lastQuery = logsRef.where('target', '==', target.name).orderBy('timestamp', 'desc').limit(1);
  const snapshot = await lastQuery.get();

  let shouldSave = true;
  let lastStatus = null;

  if (!snapshot.empty) {
    const lastDoc = snapshot.docs[0].data();
    lastStatus = lastDoc.status;
    const lastTimestamp = lastDoc.timestamp ? lastDoc.timestamp.toMillis() : 0;
    const timeElapsedMinutes = (Date.now() - lastTimestamp) / (1000 * 60);
    const statusChanged = lastStatus !== status;

    if (!statusChanged && timeElapsedMinutes < 10) {
      shouldSave = false;
      console.log(`[Monitor] ${target.name} estável. Log ignorado para poupar cotas.`);
    }
  }

  if (shouldSave) {
    const metricRecord = {
      target: target.name,
      url: target.url,
      status,
      latencyMs: latency,
      statusCode,
      dnsLookupMs: dnsData.dnsLookupMs,
      tcpConnectMs: tcpData.tcpConnectMs,
      dnsStatus: dnsData.dnsStatus,
      tcpConnected: tcpData.tcpConnected,
      tcpDetail: tcpData.tcpDetail,
      resolvedAddress: dnsData.resolvedAddress,
      requestIp: executionContext.publicIp,
      serverIp: executionContext.publicIp,
      serverRegion: executionContext.serverLocation.region || executionContext.execution.region,
      serverLocation: executionContext.serverLocation,
      execution: executionContext.execution,
      runtime: executionContext.runtime,
      timestamp: FieldValue.serverTimestamp()
    };

    await logsRef.add(metricRecord);
    console.log(`[Monitor] Sucesso! Log salvo: ${target.name} - ${status} (${latency}ms)`);

    recordMetric(target, status, latency, statusCode, lastStatus, null);

    await indexMetric({
      target_name: target.name,
      url: target.url,
      status,
      latency_ms: latency,
      dns_lookup_ms: dnsData.dnsLookupMs,
      tcp_connect_ms: tcpData.tcpConnectMs,
      status_code: statusCode,
      request_ip: executionContext.publicIp,
      server_region: executionContext.serverLocation.region || executionContext.execution.region,
      server_location: executionContext.serverLocation,
      runtime: executionContext.runtime
    });

    if (process.env.SENTRY_DSN) {
      sentryRecordHealthCheck({
        target_name: target.name,
        url: target.url,
        status,
        latency_ms: latency,
        dns_lookup_ms: dnsData.dnsLookupMs,
        tcp_connect_ms: tcpData.tcpConnectMs,
        status_code: statusCode,
        request_ip: executionContext.publicIp,
        server_region: executionContext.serverLocation.region || executionContext.execution.region,
        runtime: executionContext.runtime
      });
    }
  }
}

async function runAllChecks() {
  for (const target of targets) {
    await runCheck(target);
  }
}

console.log('🚀 Monitor de Infraestrutura iniciado com rede, runtime e contexto de execução...');
runAllChecks();
setInterval(runAllChecks, 300000);
