import { useEffect, useState } from 'react';
import './CheckHistory.css';

const periods = { day: 'Últimas 24h', week: 'Últimos 7 dias', custom: 'Personalizado' };
const events = {
  all: 'Todas as verificações', down: 'Falhas', recovered: 'Recuperações',
  up: 'Disponíveis', unknown: 'Inconclusivas'
};

export async function requestPublicHistory(params, signal) {
  const response = await fetch('/api/check-history?' + params, { signal, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.error || 'Não foi possível consultar o histórico.');
  return body;
}

function dateRange(period, firstDay, lastDay, now) {
  if (period !== 'custom') {
    return [new Date(now - (period === 'week' ? 7 : 1) * 86400000), new Date(now + 1)];
  }
  if (!firstDay || !lastDay || firstDay > lastDay) return null;
  const end = new Date(lastDay + 'T00:00:00');
  end.setDate(end.getDate() + 1);
  return [new Date(firstDay + 'T00:00:00'), end];
}

export default function CheckHistory({ load, services, revision, children }) {
  const [period, setPeriod] = useState('day');
  const [target, setTarget] = useState('all');
  const [event, setEvent] = useState('all');
  const [firstDay, setFirstDay] = useState('');
  const [lastDay, setLastDay] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [cursors, setCursors] = useState([null]);
  const [anchor, setAnchor] = useState(Date.now);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const cursor = cursors.at(-1);
  const firstPageRevision = cursor ? null : revision;

  useEffect(() => {
    const range = dateRange(period, firstDay, lastDay, cursor ? anchor : Date.now());
    if (!range) return;
    const params = new URLSearchParams({
      from: range[0].toISOString(), to: range[1].toISOString(), event, target
    });
    if (cursor) params.set('cursor', cursor);
    const controller = new AbortController();
    load(params, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ ...data, params, revision: firstPageRevision, cursor });
    }).catch(err => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [period, firstDay, lastDay, anchor, event, target, cursor, load, firstPageRevision]);

  function reset(change, value) {
    change(value);
    setAnchor(Date.now());
    setCursors([null]);
    setResult(null);
    setError('');
  }
  function move(next) {
    if (next) setAnchor(Date.parse(result.params.get('to')) - 1);
    setCursors(previous => next ? [...previous, next] : previous.slice(0, -1));
    setResult(null);
    setError('');
  }

  const needsDates = period === 'custom' && !dateRange(period, firstDay, lastDay, anchor);
  const page = result?.revision === firstPageRevision && result?.cursor === cursor ? result : null;
  const activeFilters = Number(target !== 'all') + Number(event !== 'all');
  return <>
    <div className="check-history-filters">
      <label>Período
        <select value={period} onChange={e => reset(setPeriod, e.target.value)}>
          {Object.entries(periods).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <button className="check-history-expand" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        Filtros{activeFilters > 0 ? ' · ' + activeFilters : ''}
      </button>
      <div className={'check-history-extra' + (expanded ? ' is-expanded' : '')}>
        {services && <label>Serviço
          <select value={target} onChange={e => reset(setTarget, e.target.value)}>
            <option value="all">Todos os serviços</option>
            {services.map(service => <option key={service}>{service}</option>)}
          </select>
        </label>}
        <label>Evento
          <select value={event} onChange={e => reset(setEvent, e.target.value)}>
            {Object.entries(events).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {period === 'custom' && <div className="check-history-dates">
        <label>De<input type="date" value={firstDay} max={lastDay || undefined} onChange={e => reset(setFirstDay, e.target.value)} /></label>
        <label>Até<input type="date" value={lastDay} min={firstDay || undefined} onChange={e => reset(setLastDay, e.target.value)} /></label>
      </div>}
    </div>
    {needsDates ? <p className="check-history-message">Escolha as datas de início e fim.</p> :
      error ? <div className="check-history-message" role="alert">{error} <button type="button" onClick={() => reset(setEvent, event)}>Tentar novamente</button></div> :
      !page ? <p className="check-history-message" role="status">Carregando verificações…</p> :
      page.samples.length ? children(page.samples) :
      <p className="check-history-message" role="status">{page.nextCursor ? 'Nenhum resultado nesta página. Há registros anteriores para consultar.' : 'Nenhum registro para estes filtros nesta página.'}</p>}
    {!needsDates && (cursors.length > 1 || page?.nextCursor) &&
      <nav className="pagination check-history-pages" aria-label="Páginas do histórico">
        <button type="button" onClick={() => move(null)} disabled={cursors.length === 1}>Anterior</button>
        <span>Página {cursors.length}</span>
        <button type="button" onClick={() => move(page.nextCursor)} disabled={!page?.nextCursor || !!error}>Próxima</button>
      </nav>}
  </>;
}
