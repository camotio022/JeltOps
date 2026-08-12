import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

export async function runUptimeCheck(targetName, urlToTest) {
  const startTime = performance.now();
  let status = "DOWN";
  let statusCode = 0;
  let latency = 0;

  try {
    const response = await fetch(urlToTest, { 
      method: "GET", 
      mode: "no-cors" 
    });
    
    const endTime = performance.now();
    latency = Math.round(endTime - startTime);
    status = "UP";
    statusCode = response.status || 200;
  } catch (error) {
    const endTime = performance.now();
    latency = Math.round(endTime - startTime);
    status = "DOWN";
    statusCode = 500;
  }

  const metricData = {
    target: targetName,
    url: urlToTest,
    status: status,
    latencyMs: latency,
    statusCode: statusCode,
    timestamp: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "metrics_logs"), metricData);
  } catch (e) {
    console.error("Erro ao salvar métrica no Firestore:", e);
  }

  return metricData;
}