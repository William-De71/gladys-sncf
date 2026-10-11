import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTracker, delayLevel, SCENE_TRIGGERS } from '../src/tracker.js';
import { NOW, MINUTE } from './helpers/fixtures.js';

const train = (id, { delay = 0, cancelled = false, offset = 60 } = {}) => ({
  id,
  baseDeparture: NOW + offset * MINUTE,
  departure: NOW + (offset + delay) * MINUTE,
  delay,
  cancelled,
});

/**
 * @description A store kept in memory.
 * @returns {object} The store.
 */
function memoryStore() {
  let value;
  return {
    load: async (fallback) => (value === undefined ? fallback : structuredClone(value)),
    save: async (next) => {
      value = structuredClone(next);
    },
  };
}

test('ranks the delays', () => {
  assert.equal(delayLevel(4, 5), null);
  assert.equal(delayLevel(5, 5), 'minor');
  assert.equal(delayLevel(15, 5), 'major');
  assert.equal(delayLevel(45, 5), 'severe');
  assert.equal(delayLevel(16, 20), null);
});

test('fires a delay once per level, and a cancellation once', () => {
  const tracker = createTracker();
  const keys = (events) => events.map((event) => [event.key, event.level ?? null]);
  assert.deepEqual(keys(tracker.diff('t', [train('a', { delay: 3 })], 5)), []);
  assert.deepEqual(keys(tracker.diff('t', [train('a', { delay: 6 })], 5)), [
    [SCENE_TRIGGERS.TRAIN_DELAYED, 'minor'],
  ]);
  assert.deepEqual(keys(tracker.diff('t', [train('a', { delay: 9 })], 5)), []);
  assert.deepEqual(keys(tracker.diff('t', [train('a', { delay: 20 })], 5)), [
    [SCENE_TRIGGERS.TRAIN_DELAYED, 'major'],
  ]);
  assert.deepEqual(keys(tracker.diff('t', [train('a', { delay: 8 })], 5)), []);
  assert.deepEqual(keys(tracker.diff('t', [train('a', { cancelled: true })], 5)), [
    [SCENE_TRIGGERS.TRAIN_CANCELLED, null],
  ]);
  assert.deepEqual(keys(tracker.diff('t', [train('a', { cancelled: true })], 5)), []);
  // Same train, another trip: its own events.
  assert.equal(tracker.diff('u', [train('a', { cancelled: true })], 5).length, 1);
});

test('reminds the closest mark only, on the real-time departure', () => {
  const tracker = createTracker();
  // Leaves in 13 min (scheduled in 8, 5 min late): the 15 min mark.
  const late = train('a', { offset: 8, delay: 5 });
  const first = tracker.reminders('t', [late], NOW);
  assert.deepEqual(
    first.map((e) => e.minutes),
    [15],
  );
  assert.deepEqual(tracker.reminders('t', [late], NOW + 30000), []);
  // 4 min 30 s left: the 5 min mark (10 is skipped, never late).
  assert.deepEqual(
    tracker.reminders('t', [late], NOW + 8.5 * MINUTE).map((e) => e.minutes),
    [5],
  );
  // A train 50 min away and a cancelled one: nothing yet / never.
  assert.deepEqual(tracker.reminders('t', [train('b', { offset: 50 })], NOW), []);
  assert.deepEqual(tracker.reminders('t', [train('c', { offset: 5, cancelled: true })], NOW), []);
});

test('remembers what was fired across a restart, for a day', async () => {
  const store = memoryStore();
  const first = createTracker({ store });
  await first.load();
  first.diff('t', [train('a', { cancelled: true })], 5);
  await first.persist(NOW);
  const second = createTracker({ store });
  await second.load();
  assert.deepEqual(second.diff('t', [train('a', { cancelled: true })], 5), []);
  await second.persist(NOW + 2 * 24 * 60 * MINUTE);
  const third = createTracker({ store });
  await third.load();
  assert.equal(third.diff('t', [train('a', { cancelled: true })], 5).length, 1);
});
