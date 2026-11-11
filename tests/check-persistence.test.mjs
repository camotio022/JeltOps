import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSaveCheck, STABLE_SAMPLE_INTERVAL_MS } from '../backend/check-persistence.js';

const now = Date.parse('2026-11-11T18:00:00Z');
const last = (status, statusCode, ageMs) => ({status,statusCode,timestamp:{toMillis:()=>now-ageMs}});

test('first execution always persists', () => {
  assert.equal(shouldSaveCheck(null,{status:'UP',statusCode:200},now),true);
});
test('repeated HTTP 200 within ten minutes does not write', () => {
  assert.equal(shouldSaveCheck(last('UP',200,60_000),{status:'UP',statusCode:200},now),false);
  assert.equal(shouldSaveCheck(last('UP',200,9*60_000),{status:'UP',statusCode:200},now),false);
});
test('stable HTTP 200 generates periodic sample at ten minutes', () => {
  assert.equal(shouldSaveCheck(last('UP',200,STABLE_SAMPLE_INTERVAL_MS),{status:'UP',statusCode:200},now),true);
});
test('failure saves immediately regardless of heartbeat', () => {
  assert.equal(shouldSaveCheck(last('UP',200,60_000),{status:'DOWN',statusCode:503},now),true);
});
test('recovery saves immediately regardless of heartbeat', () => {
  assert.equal(shouldSaveCheck(last('DOWN',503,60_000),{status:'UP',statusCode:200},now),true);
});
test('repeated DOWN persists on ten minute heartbeat, not every minute', () => {
  assert.equal(shouldSaveCheck(last('DOWN',503,60_000),{status:'DOWN',statusCode:503},now),false);
  assert.equal(shouldSaveCheck(last('DOWN',503,STABLE_SAMPLE_INTERVAL_MS),{status:'DOWN',statusCode:503},now),true);
});
test('HTTP status code change saves even when both statuses classify as UP', () => {
  assert.equal(shouldSaveCheck(last('UP',200,60_000),{status:'UP',statusCode:204},now),true);
});
test('unreadable timestamp is persisted defensively', () => {
  assert.equal(shouldSaveCheck({status:'UP',statusCode:200,timestamp:'invalid'},{status:'UP',statusCode:200},now),true);
});
