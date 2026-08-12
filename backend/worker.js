import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';

// Permite carregar o arquivo JSON de credenciais em ambiente ES Module
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const connection = new IORedis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null
});

const worker = new Worker('uptime-queue', async (job) => {
  const { name, url } = job.data;
  console.log(`[Worker] Verificando alvo: ${name}`);

  const startTime = Date.now();
  let status = 'DOWN';
  let statusCode = 0;

  try {
    const response = await fetch(url, { method: 'GET' });
    const endTime = Date.now();
    statusCode = response.status;
    status = response.ok || statusCode < 400 ? 'UP' : 'DOWN';
    var latency = endTime - startTime;
  } catch (error) {
    const endTime = Date.now();
    var latency = endTime - startTime;
    status = 'DOWN';
    statusCode = 500;
  }

  const logsRef = db.collection('metrics_logs');
  const lastLogQuery = logsRef.where('target', '==', name).orderBy('timestamp', 'desc').limit(1);
  const snapshot = await lastLogQuery.get();

  let shouldSave = true;

  if (!snapshot.empty) {
    const lastDoc = snapshot.docs[0].data();
    const lastStatus = lastDoc.status;
    const lastTimestamp = lastDoc.timestamp ? lastDoc.timestamp.toMillis() : 0;
    const now = Date.now();

    const statusChanged = lastStatus !== status;
    const timeElapsedMinutes = (now - lastTimestamp) / (1000 * 60);

    if (!statusChanged && timeElapsedMinutes < 10) {
      shouldSave = false;
      console.log(`[Worker] Ignorando log para ${name}: Status estável e intervalo recente (< 10 min).`);
    }
  }

  if (shouldSave) {
    await logsRef.add({
      target: name,
      url: url,
      status: status,
      latencyMs: latency,
      statusCode: statusCode,
      timestamp: FieldValue.serverTimestamp()
    });
    console.log(`[Worker] Log salvo no Firestore: ${name} - ${status} (${latency}ms)`);
  }

}, { 
  connection,
  concurrency: 2 
});

worker.on('completed', (job) => {});
worker.on('failed', (job, err) => {
  console.error(`[Worker] Erro na tarefa ${job.id}:`, err);
});