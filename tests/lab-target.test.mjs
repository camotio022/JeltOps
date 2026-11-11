import test from 'node:test';
import assert from 'node:assert/strict';
import { getLabState, getCyclicLabState } from '../api/lab-target.js';
const start = Date.parse('2026-11-11T17:30:00Z');

test('waiting before start', () => assert.deepEqual(getLabState(start - 1, start), { phase: 'WAITING', statusCode: 200 }));
test('healthy first two minutes', () => {
  assert.equal(getLabState(start, start).statusCode, 200);
  assert.equal(getLabState(start + 119999, start).statusCode, 200);
});
test('simulated outage 2 to 14 minutes', () => {
  assert.equal(getLabState(start + 120000, start).statusCode, 503);
  assert.equal(getLabState(start + 839999, start).statusCode, 503);
});
test('recovers automatically from minute 14 onward', () => {
  assert.equal(getLabState(start + 840000, start).statusCode, 200);
  assert.equal(getLabState(start + 86400000, start).phase, 'RECOVERED');
});
test('invalid time returns non-success', () => assert.equal(getLabState(start, NaN).statusCode, 503));

test('cyclic experiment transitions automatically through healthy, down, recovered', () => {
  const m = 60_000;
  assert.equal(getCyclicLabState(1*m).statusCode, 200);
  assert.equal(getCyclicLabState(11*m).statusCode, 503);
  assert.equal(getCyclicLabState(21*m).phase, 'RECOVERED');
  assert.equal(getCyclicLabState(31*m).statusCode, 200);
});
