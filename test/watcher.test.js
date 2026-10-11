import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readTrip, createWatcher } from '../src/watcher.js';
import { createQuota } from '../src/quota.js';
import { SncfError } from '../src/sncf-api.js';
import {
  NOW,
  MINUTE,
  TRIP,
  fakeSncf,
  journeysAnswer,
  rawJourney,
  rawDisruption,
  rawDeparture,
} from './helpers/fixtures.js';

test('reads a trip: timetable + real time, cancellation confirmed on the board', async () => {
  const sncf = fakeSncf({
    base: journeysAnswer([
      rawJourney({ number: 'A', baseDeparture: NOW + 10 * MINUTE }),
      rawJourney({ number: 'B', baseDeparture: NOW + 40 * MINUTE }),
      rawJourney({ number: 'C', baseDeparture: NOW + 70 * MINUTE }),
    ]),
    realtime: journeysAnswer([
      rawJourney({ number: 'A', baseDeparture: NOW + 10 * MINUTE, delay: 12 }),
      rawJourney({ number: 'C', baseDeparture: NOW + 70 * MINUTE }),
    ]),
    departures: {
      departures: [rawDeparture({ number: 'C', baseDeparture: NOW + 70 * MINUTE })],
      disruptions: [],
    },
  });
  const snapshot = await readTrip(sncf, TRIP, 4, NOW);
  assert.deepEqual(
    snapshot.trains.map((train) => [train.number, train.delay, train.cancelled]),
    [
      ['A', 12, false],
      ['B', 0, true],
      ['C', 0, false],
    ],
  );
  assert.deepEqual(
    sncf.calls.map((call) => call.kind),
    ['base_schedule', 'realtime', 'departures'],
  );
  assert.equal(sncf.calls[0].datetime, '20261012T061500'); // 45 min back
  assert.equal(sncf.calls[0].count, 8);
});

test('two requests only when nothing is suspected', async () => {
  const answer = journeysAnswer(
    [rawJourney({ number: 'A', baseDeparture: NOW + 10 * MINUTE })],
    [rawDisruption({ number: 'A' })],
  );
  const sncf = fakeSncf({ base: answer, realtime: journeysAnswer([]) });
  const snapshot = await readTrip(sncf, TRIP, 4, NOW);
  assert.equal(snapshot.trains[0].cancelled, true);
  assert.equal(sncf.calls.length, 2);
});

test('the watcher reuses a fresh read and reports changes', async () => {
  const sncf = fakeSncf({
    base: journeysAnswer([rawJourney({ number: 'A', baseDeparture: NOW + 10 * MINUTE })]),
    realtime: journeysAnswer([rawJourney({ number: 'A', baseDeparture: NOW + 10 * MINUTE })]),
  });
  const reads = [];
  let now = NOW;
  const watcher = createWatcher({
    sncf,
    quota: createQuota({ now: () => now }),
    getTrips: () => [TRIP],
    getSettings: () => ({ trainCount: 4, pollInterval: 3, idleInterval: 30 }),
    onRead: async (trip, snapshot, { changed }) => reads.push(changed),
    now: () => now,
  });
  await watcher.get(TRIP, 60000);
  await watcher.get(TRIP, 60000);
  assert.equal(sncf.calls.length, 2);
  now += 2 * MINUTE;
  await watcher.get(TRIP, 60000);
  assert.deepEqual(reads, [true, false]);
  assert.equal(watcher.peek(TRIP.key).trains.length, 1);
});

test('a 429 blocks the quota and is reported', async () => {
  const quota = createQuota({ now: () => NOW });
  const errors = [];
  const watcher = createWatcher({
    sncf: fakeSncf({
      base: new SncfError('quota', { status: 429, retryAfter: 120 }),
      realtime: journeysAnswer([]),
    }),
    quota,
    getTrips: () => [TRIP],
    getSettings: () => ({ trainCount: 4, pollInterval: 3, idleInterval: 30 }),
    onRead: async () => {},
    onError: async (trip, err) => errors.push(err.status),
    now: () => NOW,
  });
  await assert.rejects(watcher.get(TRIP, 0));
  assert.deepEqual(errors, [429]);
  assert.equal(quota.blockedUntil(), NOW + 120000);
  assert.equal(watcher.errors()[0].error.status, 429);
});
