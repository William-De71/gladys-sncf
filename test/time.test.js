import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseNavitiaDate,
  toNavitiaDate,
  formatTime,
  minutesOfDay,
  isoWeekday,
  parisDate,
} from '../src/time.js';

test('reads the dates of the API as Paris time, summer and winter', () => {
  assert.equal(parseNavitiaDate('20261011T074200'), Date.parse('2026-10-11T05:42:00Z'));
  assert.equal(parseNavitiaDate('20260115T120000'), Date.parse('2026-01-15T11:00:00Z'));
});

test('crosses the time changes', () => {
  // 25 October 2026, 03:00 summer time becomes 02:00 winter time.
  assert.equal(parseNavitiaDate('20261025T013000'), Date.parse('2026-10-24T23:30:00Z'));
  assert.equal(parseNavitiaDate('20261025T040000'), Date.parse('2026-10-25T03:00:00Z'));
  // 29 March 2026, 02:00 winter time becomes 03:00 summer time.
  assert.equal(parseNavitiaDate('20260329T010000'), Date.parse('2026-03-29T00:00:00Z'));
  assert.equal(parseNavitiaDate('20260329T040000'), Date.parse('2026-03-29T02:00:00Z'));
});

test('refuses what is not a date', () => {
  assert.equal(parseNavitiaDate(''), null);
  assert.equal(parseNavitiaDate(undefined), null);
  assert.equal(parseNavitiaDate('2026-10-11T07:42:00'), null);
});

test('formats instants back, whatever the time zone of the process', () => {
  const ms = Date.parse('2026-10-11T05:42:00Z');
  assert.equal(toNavitiaDate(ms), '20261011T074200');
  assert.equal(formatTime(ms), '07:42');
  assert.equal(minutesOfDay(ms), 462);
  assert.equal(isoWeekday(ms), 7);
  assert.equal(parisDate(Date.parse('2026-10-11T22:30:00Z')), '2026-10-12');
});
