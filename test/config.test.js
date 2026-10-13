import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  parseHours,
  parseDays,
  readLanguage,
  TRAIN_COUNT,
  POLL_INTERVAL,
  AUTO_LANGUAGE,
} from '../src/config.js';

const KEY = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

test('reads the trips that have both stations', () => {
  const config = normalizeConfig({
    api_key: ` ${KEY} `,
    trip_1_from: ' Rennes ',
    trip_1_to: 'Nantes',
    trip_1_hours: '07:00-09:30',
    trip_1_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    trip_2_from: 'Nantes',
    trip_3_from: 'stop_area:SNCF:87481002',
    trip_3_to: '87471003',
  });
  assert.equal(config.apiKey, KEY);
  assert.deepEqual(
    config.trips.map((trip) => [trip.slot, trip.from, trip.to]),
    [
      [1, 'Rennes', 'Nantes'],
      [3, 'stop_area:SNCF:87481002', '87471003'],
    ],
  );
  assert.deepEqual(config.trips[0].hours, { start: 420, end: 570 });
  assert.deepEqual(config.trips[0].days, [1, 2, 3, 4, 5]);
  assert.equal(config.trips[1].hours, null);
  assert.deepEqual(config.trips[1].days, [1, 2, 3, 4, 5, 6, 7]);
});

test('falls back to the defaults and clamps the numbers', () => {
  const config = normalizeConfig({ api_key: 'short', train_count: '42', poll_interval: '' });
  assert.equal(config.apiKey, '');
  assert.equal(config.trainCount, TRAIN_COUNT.max);
  assert.equal(config.pollInterval, POLL_INTERVAL.default);
  assert.deepEqual(normalizeConfig(null).trips, []);
});

test('understands the usual ways to write a window', () => {
  assert.deepEqual(parseHours('7h-9h30'), { start: 420, end: 570 });
  assert.deepEqual(parseHours('06:45 à 08:00'), { start: 405, end: 480 });
  assert.deepEqual(parseHours('17:00 – 19:15'), { start: 1020, end: 1155 });
  assert.deepEqual(parseHours('22:00-01:00'), { start: 1320, end: 1440 });
  assert.equal(parseHours('morning'), null);
  assert.equal(parseHours('25:00-26:00'), null);
  assert.equal(parseHours(''), null);
});

test('reads the days as sent by the form, or stored as a string', () => {
  assert.deepEqual(parseDays(['fri', 'mon', 'mon', 'bogus']), [1, 5]);
  assert.deepEqual(parseDays('["sat","sun"]'), [6, 7]);
  assert.deepEqual(parseDays('sat, sun'), [6, 7]);
  assert.deepEqual(parseDays([]), [1, 2, 3, 4, 5, 6, 7]);
});

test('keeps a valid stored language only', () => {
  assert.equal(readLanguage({ last_language: 'fr' }, 'en'), 'fr');
  assert.equal(readLanguage({ last_language: 'french' }, 'en'), 'en');
});

test('reads the language setting, automatic unless a known language', () => {
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.equal(normalizeConfig({ language }).language, language);
  }
  assert.equal(normalizeConfig({ language: 'auto' }).language, AUTO_LANGUAGE);
  assert.equal(normalizeConfig({ language: 'it' }).language, AUTO_LANGUAGE);
  assert.equal(normalizeConfig({}).language, AUTO_LANGUAGE);
});
