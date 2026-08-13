import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Inicializa o Firebase Admin de forma segura na nuvem da Vercel
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

const targets = [
  { name: "YouTube Main API", url: "https://www.youtube.com" },
  { name: "Google Endpoint", url: "https://www.google.com" }
];

export default async function handler(req, res) {
  // Opcional: segurança básica para acionamento via Vercel Cron
  console.log('[Vercel Cron] Iniciando verificação de infraestrutura...');

  const results = [];

  for (const target of targets) {
    const startTime = Date.now();
    let status = 'DOWN';
    let statusCode = 0;
    let latency = 0;

    try {
      const response = await fetch(target.url, { method: 'GET' });
      const endTime = Date.now();
      statusCode = response.status;
      status = response.ok || statusCode < 400 ? 'UP' : 'DOWN';
      latency = endTime - startTime;
    } catch (error) {
      latency = Date.now() - startTime;
      status = 'DOWN';
      statusCode = 500;
    }

    const logsRef = db.collection('metrics_logs');

    // Salva o log diretamente no Firestore
    await logsRef.add({
      target: target.name,
      url: target.url,
      status: status,
      latencyMs: latency,
      statusCode: statusCode,
      timestamp: FieldValue.serverTimestamp()
    });

    results.push({ target: target.name, status, latency });
  }

  return res.status(200).json({
    success: true,
    message: 'Verificações concluídas com sucesso!',
    checkedAt: new Date().toISOString(),
    results
  });
}