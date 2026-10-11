import { test } from 'node:test';
import assert from 'node:assert/strict';

import { atParisTime, isBusy, followedSpan, upcoming, nextDelay } from '../src/schedule.js';
import { NOW, MINUTE } from './helpers/fixtures.js';

// NOW is Monday 12 October 2026, 07:00 in Paris.
const WEEKDAYS = [1, 2, 3, 4, 5];
const morning = { hours: { start: 450, end: 570 }, days: WEEKDAYS }; // 07:30-09:30
const evening = { hours: { start: 1020, end: 1140 }, days: WEEKDAYS }; // 17:00-19:00
const allDay = { hours: null, days: [1, 2, 3, 4, 5, 6, 7] };
const intervals = { pollInterval: 3, idleInterval: 30 };

test('builds Paris instants', () => {
  assert.equal(atParisTime('2026-10-12', 420), NOW);
  assert.equal(atParisTime('2026-10-12', 1440), Date.parse('2026-10-12T22:00:00Z'));
});

test('is busy from an hour before the window to its end, on the travel days', () => {
  assert.equal(isBusy(morning, NOW), true); // 30 min before 07:30
  assert.equal(isBusy(morning, NOW - 31 * MINUTE), false);
  assert.equal(isBusy(morning, NOW + 150 * MINUTE), false); // 09:30
  assert.equal(isBusy(evening, NOW), false);
  // Saturday 17 October, 08:00.
  assert.equal(isBusy(morning, NOW + 5 * 24 * 60 * MINUTE + 60 * MINUTE), false);
  assert.equal(isBusy(allDay, NOW), true);
  assert.equal(isBusy(allDay, atParisTime('2026-10-12', 120)), false); // 02:00, no train
});

test('follows the trains of the next window', () => {
  // Before the window: from its start.
  assert.deepEqual(followedSpan(morning, NOW), {
    from: atParisTime('2026-10-12', 450),
    until: atParisTime('2026-10-12', 570),
    date: '2026-10-12',
  });
  // During: from a little in the past (late trains).
  const during = NOW + 120 * MINUTE;
  assert.equal(followedSpan(morning, during).from, during - 45 * MINUTE);
  // Over: the next travel day. Friday evening -> Monday.
  const friday = atParisTime('2026-10-16', 1200);
  assert.equal(followedSpan(morning, friday).date, '2026-10-19');
  // No window: the next trains.
  assert.deepEqual(followedSpan(allDay, NOW), { from: NOW - 45 * MINUTE, until: null, date: null });
});

test('keeps the trains still to come, in the window', () => {
  const train = (offset, { delay = 0, cancelled = false } = {}) => ({
    baseDeparture: NOW + offset * MINUTE,
    departure: NOW + (offset + delay) * MINUTE,
    cancelled,
  });
  const trains = [
    train(-20), // left
    train(-20, { delay: 25 }), // late, not left yet
    train(-5, { cancelled: true }), // cancelled, its time is over
    train(10, { cancelled: true }),
    train(30),
    train(200), // after the window
  ];
  const span = { from: NOW - 45 * MINUTE, until: NOW + 150 * MINUTE };
  assert.deepEqual(
    upcoming(trains, span, NOW, 8).map((t) => t.baseDeparture),
    [NOW - 20 * MINUTE, NOW + 10 * MINUTE, NOW + 30 * MINUTE],
  );
  assert.equal(upcoming(trains, span, NOW, 1).length, 1);
});

test('reads often around the window, and wakes up in time for it', () => {
  assert.equal(nextDelay(morning, NOW, intervals), 3 * MINUTE);
  // 15:50: idle, but the busy period of the evening starts at 16:00.
  const delay = nextDelay(evening, atParisTime('2026-10-12', 950), intervals);
  assert.ok(delay <= 12 * MINUTE && delay >= 9 * MINUTE, `${delay / MINUTE} min`);
  assert.equal(nextDelay(evening, NOW, intervals), 30 * MINUTE);
});
