import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMonitorUrl,isPublicIPv4,resolvePublicAddress,probePublicSite} from '../backend/public-probe.js';
import {isDue,summarizeSamples} from '../backend/monitor-policy.js';
test('permite apenas origem HTTPS',()=>{
  assert.equal(normalizeMonitorUrl('https://exemplo.com'), 'https://exemplo.com/');
  for(const value of ['http://exemplo.com','https://127.0.0.1','https://[::1]',
    'https://localhost','https://localhost.local','https://10.0.0.10',
    'https://exemplo.com:8443','https://user:pass@exemplo.com',
    'https://exemplo.com/admin','https://exemplo.com/?url=http://localhost',
    'https://exemplo.com#teste','file:///etc/passwd']) {
    assert.throws(()=>normalizeMonitorUrl(value),value);
  }
});
test('rejeita redes reservadas e de metadata',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.0.1','172.20.4.5','100.64.0.5','192.0.2.5','203.0.113.9','8.8.8.8.8']) assert.equal(isPublicIPv4(ip),false,ip);
  assert.equal(isPublicIPv4('8.8.8.8'),true);
});
test('audita TODOS endereços DNS antes de fixar IP',async ()=>{
  await assert.rejects(()=>resolvePublicAddress('alvo.com',async()=>['8.8.8.8','127.0.0.1']));
  assert.equal(await resolvePublicAddress('alvo.com',async()=>['8.8.8.8']), '8.8.8.8');
  assert.equal(await resolvePublicAddress('alvo.com',async()=>[{address:'8.8.8.8',family:4}]), '8.8.8.8');
});
test('falha de DNS sem resposta HTTP é inconclusiva, não DOWN',async()=>{
  const result=await probePublicSite('https://exemplo.com',{resolver:async()=>{throw new Error('DNS_BLOCKED')} });
  assert.equal(result.status,'UNKNOWN');
  assert.equal(result.statusCode,0);
  assert.match(result.error,/DNS_BLOCKED/);
});
test('controle de frequência e indicadores não equivalem a uptime',()=>{
  assert.equal(isDue(undefined,Date.now()),true);
  assert.equal(isDue(1000,61000),true);
  assert.deepEqual(summarizeSamples([{status:'UP',latencyMs:120},{status:'DOWN',latencyMs:300}]),
    {sampleCount:2,upSamplePercent:50,avgLatencyMs:210});
});
