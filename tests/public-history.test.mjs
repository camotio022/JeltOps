import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberPublicHistory, requestPublicHistory } from '../src/publicHistory.js';

test('public history renders and paginates saved samples when the API returns 503', async t => {
  const mockFetch = t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  const now = Date.UTC(2026, 10, 17, 12);
  const params = new URLSearchParams({
    from: new Date(now - 86400000).toISOString(), to: new Date(now + 1).toISOString(),
    event: 'all', target: 'all'
  });
  const signal = new AbortController().signal;
  await assert.rejects(requestPublicHistory(params, signal), /Não foi possível/);

  rememberPublicHistory(Array.from({ length: 9 }, (_, index) => ({
    id: String(index), target: 'Google Endpoint', status: index === 8 ? 'DOWN' : 'UP',
    timestamp: new Date(now - index * 60000)
  })));

  const first = await requestPublicHistory(params, signal);
  assert.equal(first.partial, true);
  assert.deepEqual(first.samples.map(sample => sample.id), ['0', '1', '2', '3', '4', '5', '6']);
  params.set('cursor', first.nextCursor);
  const second = await requestPublicHistory(params, signal);
  assert.deepEqual(second.samples.map(sample => sample.id), ['7', '8']);
  assert.equal(mockFetch.mock.callCount(), 2);

  params.delete('cursor');
  params.set('event', 'recovered');
  const recovery = await requestPublicHistory(params, signal);
  assert.deepEqual(recovery.samples.map(sample => sample.id), ['7']);

  mockFetch.mock.mockImplementation(async () => Response.json({ error: 'Filtro inválido' }, { status: 400 }));
  await assert.rejects(requestPublicHistory(params, signal), /Filtro inválido/);
});
