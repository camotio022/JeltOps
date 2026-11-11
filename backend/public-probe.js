// Probe only publicly routable HTTPS IPv4 endpoints; DNS is pinned to the audited address.
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const blocks = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],
  ['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],
  ['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
]) blocks.addSubnet(address, prefix, 'ipv4');

export function isPublicIPv4(ip) {
  return net.isIP(ip) === 4 && !blocks.check(ip, 'ipv4');
}

export function normalizeMonitorUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 253) throw new Error('url_invalida');
  let parsed;
  try { parsed = new URL(raw.trim()); } catch { throw new Error('url_invalida'); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.port || parsed.hash || !host.includes('.') || net.isIP(host) ||
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host.endsWith('.test') || host.endsWith('.invalid') ||
      host.endsWith('.example') || !/^[a-z0-9.-]+$/.test(host) ||
      host.length > 253 || host.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    throw new Error('url_nao_permitida');
  }
  // No arbitrary query strings, embedded URL parameters, or redirect following.
  if (parsed.search || parsed.pathname !== '/') throw new Error('somente_origem_https');
  return parsed.origin + '/';
}

export async function resolvePublicAddress(hostname, resolver = dns.resolve4) {
  const addresses = await Promise.race([
    resolver(hostname),
    new Promise((_, reject) => setTimeout(() => reject(new Error('dns_tempo_esgotado')), 4000))
  ]);
  if (!Array.isArray(addresses) || !addresses.length ||
      addresses.some(ip => !isPublicIPv4(ip))) throw new Error('destino_nao_publico');
  return addresses[0];
}

export async function probePublicSite(raw, opts = {}) {
  const url = normalizeMonitorUrl(raw);
  const hostname = new URL(url).hostname;
  const start = Date.now();
  try {
    const ip = await resolvePublicAddress(hostname, opts.resolver);
    const code = await new Promise((resolve, reject) => {
      const request = https.request(url, {
        method: 'GET', timeout: 8000, agent: false,
        lookup: (_name, _options, callback) => callback(null, ip, 4),
        headers: {'User-Agent': 'JeltOps/1.0 (+monitoramento-de-sites)', Accept:'*/*'}
      }, response => {
        const code = response.statusCode ?? 0;
        // Do not follow 3xx. Do not download response bodies.
        response.destroy();
        resolve(code);
      });
      request.on('timeout', () => request.destroy(new Error('tempo_esgotado')));
      request.on('error', reject);
      request.end();
    });
    return { statusCode:code, status: code >= 200 && code < 400 ? 'UP':'DOWN', latencyMs:Date.now()-start, resolvedAddress:ip };
  } catch(error) {
    return {statusCode:0,status:'DOWN',latencyMs:Date.now()-start,error:error.message?.slice(0,100) || 'erro_de_rede'};
  }
}
