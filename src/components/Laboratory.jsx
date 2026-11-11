import { useCallback, useEffect, useState } from 'react';
import './Laboratory.css';

const displayTime = (date) => new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function Laboratory() {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState('');

  const probe = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/lab-target', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!data || data.service !== 'jeltops-lab') {
        if (data?.error === 'lab_disabled') throw new Error('Laboratório desativado na produção. Teste o ciclo de falha e recuperação no ambiente de preview.');
        throw new Error(data?.error || `Resposta inesperada (HTTP ${response.status})`);
      }
      const entry = { id: `${Date.now()}-${Math.random()}`, checkedAt: data.checkedAt || new Date().toISOString(), status: data.status, phase: data.phase, statusCode: response.status, mode: data.mode };
      setSamples((prev) => [entry, ...prev].slice(0, 25));
      setLastError('');
    } catch (error) {
      setLastError(error.message || 'Sem acesso ao serviço de laboratório');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    probe();
    const timer = setInterval(probe, 30000);
    return () => clearInterval(timer);
  }, [probe]);

  const last = samples[0];
  const online = last?.statusCode === 200;
  const transitions = samples.slice().reverse().filter((sample, i, arr) => i === 0 || sample.status !== arr[i - 1]?.status).reverse();

  return (
    <section className="lab-page" aria-label="Simulação de falha e recuperação">
      <header className="lab-heading">
        <span className="eyebrow">TESTES · AMBIENTE DE PREVIEW</span>
        <h2>Laboratório de monitoramento</h2>
        <p>Este experimento simula indisponibilidade e recuperação do nosso próprio serviço. Não altera os registros dos sites reais.</p>
      </header>
      <article className="lab-status-panel">
        <div className="lab-status-top">
          <span className="lab-chip">Simulação controlada</span>
          <span className="lab-timing">Atualiza a cada 30 segundos</span>
        </div>
        <div className="lab-current-status">
          <div className={`lab-status-dot ${last ? (online ? 'is-up' : 'is-down') : 'is-idle'}`} aria-hidden="true" />
          <div>
            <span className="lab-current-title">{last ? (online ? 'Serviço disponível' : 'Serviço indisponível') : 'Aguardando primeira verificação'}</span>
            <strong>{last ? `HTTP ${last.statusCode}` : '—'}</strong>
          </div>
        </div>
        <p className="lab-note">{last ? `Fase: ${last.phase} · última verificação às ${displayTime(last.checkedAt)}` : 'O laboratório precisa estar habilitado no preview da Vercel.'}</p>
        {lastError && <div className="lab-error" role="alert">{lastError}</div>}
        <button type="button" disabled={loading} className="lab-check-button" onClick={probe}>{loading ? 'Verificando…' : '↻ Verificar agora'}</button>
      </article>
      <div className="lab-three-phases" aria-label="Ciclo de falha e recuperação">
        <div><span className="phase-number">01</span><strong>Operando</strong><small>HTTP 200 · 10 min</small></div>
        <div><span className="phase-number">02</span><strong>Falha</strong><small>HTTP 503 · 10 min</small></div>
        <div><span className="phase-number">03</span><strong>Recuperado</strong><small>HTTP 200 · 10 min</small></div>
      </div>
      <article className="lab-log-panel">
        <div className="section-heading"><h3>Transições detectadas</h3><span>{transitions.length} eventos</span></div>
        {transitions.length === 0 ? <p className="lab-muted">Aguardando o primeiro resultado…</p> :
          <ol className="lab-events">
            {transitions.map((event) => <li key={event.id}><span className={`lab-event-icon ${event.status === 'UP' ? 'is-up' : 'is-down'}`}>{event.status === 'UP' ? '✓' : '!'}</span><span><strong>{event.status === 'UP' ? 'Serviço respondeu normalmente' : 'Falha detectada'}</strong><small>HTTP {event.statusCode} · {displayTime(event.checkedAt)}</small></span></li>)}
          </ol>}
        <p className="lab-disclaimer">Detecção executada no navegador enquanto esta tela estiver aberta. Os registros desta demonstração são temporários e não representam monitoramento contínuo de produção.</p>
      </article>
    </section>
  );
}
