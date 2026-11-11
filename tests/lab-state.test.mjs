import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLabState, LAB_DURATION_MS } from '../backend/lab-state.js';

const t = 1_700_000_000_000;
const fixture = { startedAtMs:t, endsAtMs:t + LAB_DURATION_MS };
test('healthy before any demo',()=>assert.equal(resolveLabState(null,t).statusCode,200));
test('DOWN immediately on start',()=>assert.equal(resolveLabState(fixture,t).statusCode,503));
test('DOWN one millisecond before recovery',()=>assert.equal(resolveLabState(fixture,t+LAB_DURATION_MS-1).statusCode,503));
test('UP exactly 30s later',()=>assert.equal(resolveLabState(fixture,t+LAB_DURATION_MS).statusCode,200));
test('UP even 1h later with no running browser',()=>assert.equal(resolveLabState(fixture,t+3_600_000).status,'UP'));
