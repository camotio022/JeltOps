import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const targets = [
  { name: "YouTube Main API", url: "https://www.youtube.com" },
  { name: "Google Endpoint", url: "https://www.google.com" }
];

async function runCheck(target) {
  console.log(`[Monitor] Verificando alvo: ${target.name}...`);
  const startTime = Date.now();
  let status = 'DOWN';
  let statusCode = 0;

  try {
    const response = await fetch(target.url, { method: 'GET' });
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
  const lastQuery = logsRef.where('target', '==', target.name).orderBy('timestamp', 'desc').limit(1);
  const snapshot = await lastQuery.get();

  let shouldSave = true;

  if (!snapshot.empty) {
    const lastDoc = snapshot.docs[0].data();
    const lastStatus = lastDoc.status;
    const lastTimestamp = lastDoc.timestamp ? lastDoc.timestamp.toMillis() : 0;
    const now = Date.now();

    const statusChanged = lastStatus !== status;
    const timeElapsedMinutes = (now - lastTimestamp) / (1000 * 60);

    // Economia de cota: só salva se mudou o status ou se passou mais de 10 minutos
    if (!statusChanged && timeElapsedMinutes < 10) {
      shouldSave = false;
      console.log(`[Monitor] ${target.name} estável. Log ignorado para poupar cotas.`);
    }
  }

  if (shouldSave) {
    await logsRef.add({
      target: target.name,
      url: target.url,
      status: status,
      latencyMs: latency,
      statusCode: statusCode,
      timestamp: FieldValue.serverTimestamp()
    });
    console.log(`[Monitor] Sucesso! Log salvo: ${target.name} - ${status} (${latency}ms)`);
  }
}

async function runAllChecks() {
  for (const target of targets) {
    await runCheck(target);
  }
}

console.log('🚀 Monitor de Infraestrutura iniciado (Rodando sem Redis)...');
// Executa imediatamente ao iniciar
runAllChecks();

// Repete a cada 5 minutos (300000 ms)
setInterval(runAllChecks, 300000);