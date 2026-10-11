import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createQuota, BUDGET } from '../src/quota.js';
import { createStore } from '../src/store.js';
import { createStations } from '../src/stations.js';
import { NOW, MINUTE } from './helpers/fixtures.js';

test('the store writes and reads JSON, and survives a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-sncf-'));
  try {
    const store = createStore('x.json', { dir });
    assert.deepEqual(await store.load({ empty: true }), { empty: true });
    await store.save({ a: 1 });
    assert.deepEqual(await store.load(null), { a: 1 });
    assert.equal(await readFile(join(dir, 'x.json'), 'utf8'), '{"a":1}');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the quota counts over a sliding day and stops the rounds before the limit', async () => {
  let now = NOW;
  const quota = createQuota({ now: () => now });
  for (let i = 0; i < BUDGET - 1; i += 1) {
    quota.record();
  }
  assert.equal(quota.canPoll(), true);
  quota.record();
  assert.equal(quota.canPoll(), false);
  assert.equal(quota.canRequest(), true);
  now += 24 * 60 * MINUTE + 1;
  assert.equal(quota.used(), 0);
  assert.equal(quota.canPoll(), true);
});

test('a 429 blocks every request until its end, even after a restart', async () => {
  let saved = null;
  const store = { load: async () => saved, save: async (value) => (saved = value) };
  let now = NOW;
  const quota = createQuota({ store, now: () => now });
  quota.record();
  quota.block(600);
  assert.equal(quota.canRequest(), false);
  assert.equal(quota.blockedUntil(), NOW + 600000);
  await quota.flush();
  const restarted = createQuota({ store, now: () => now });
  await restarted.load();
  assert.equal(restarted.used(), 1);
  assert.equal(restarted.canPoll(), false);
  now += 601000;
  assert.equal(restarted.canPoll(), true);
});

test('resolves names, UIC codes and ids, searching a name only once', async () => {
  const calls = [];
  const sncf = {
    searchStations: async (query) => {
      calls.push(['search', query]);
      return query === 'Rennes' ? [{ id: 'stop_area:SNCF:87471003', name: 'Rennes' }] : [];
    },
    getStation: async (id) => {
      calls.push(['get', id]);
      return id === 'stop_area:SNCF:87481002' ? { id, name: 'Nantes' } : null;
    },
  };
  let saved = {};
  const store = { load: async () => saved, save: async (value) => (saved = { ...value }) };
  const stations = createStations({ sncf, store });
  assert.deepEqual(await stations.resolve(' Rennes '), {
    id: 'stop_area:SNCF:87471003',
    name: 'Rennes',
  });
  assert.deepEqual(await stations.resolve('rennes'), {
    id: 'stop_area:SNCF:87471003',
    name: 'Rennes',
  });
  assert.equal((await stations.resolve('87481002')).name, 'Nantes');
  assert.equal((await stations.resolve('0087481002')).name, 'Nantes');
  assert.equal((await stations.resolve('stop_area:SNCF:87481002')).name, 'Nantes');
  assert.equal(await stations.resolve('Atlantis'), null);
  assert.equal(await stations.resolve(''), null);
  assert.deepEqual(calls, [
    ['search', 'Rennes'],
    ['get', 'stop_area:SNCF:87481002'],
    ['get', 'stop_area:SNCF:87481002'],
    ['get', 'stop_area:SNCF:87481002'],
    ['search', 'Atlantis'],
  ]);
  // Remembered across a restart.
  const again = createStations({ sncf, store });
  assert.equal((await again.resolve('Rennes')).name, 'Rennes');
  assert.equal(again.peek('RENNES').id, 'stop_area:SNCF:87471003');
  assert.equal(calls.length, 5);
});
