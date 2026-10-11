import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildTripWidget,
  buildBoardWidget,
  messageContent,
  readCount,
  BOARD_COUNT,
} from '../src/widgets.js';
import { parseDepartures } from '../src/trains.js';
import { NOW, MINUTE, TRIP, capture } from './helpers/fixtures.js';

const train = (number, { offset, delay = 0, cancelled = false, cause = '' }) => ({
  id: `${number}@${NOW + offset * MINUTE}`,
  number,
  mode: 'TER',
  direction: 'Nantes',
  baseDeparture: NOW + offset * MINUTE,
  departure: NOW + (offset + delay) * MINUTE,
  baseArrival: NOW + (offset + 75) * MINUTE,
  arrival: NOW + (offset + 75 + delay) * MINUTE,
  delay,
  cancelled,
  cause,
});

const TRAINS = [
  train('858301', { offset: 5, cancelled: true, cause: 'Mouvement social local' }),
  train('858303', { offset: 20, delay: 7, cause: 'Panne de signalisation' }),
  train('858305', { offset: 50 }),
  train('858307', { offset: 80, delay: 35 }),
];

test('the trip widget fits the vocabulary and the budget', () => {
  const content = buildTripWidget({
    trip: TRIP,
    snapshot: { trains: TRAINS, span: { date: '2026-10-12' }, readAt: NOW },
    threshold: 5,
    busy: true,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, 60);
  const tiles = content.components.filter((c) => c.type === 'value');
  // The next train that runs: the 07:20, 7 min late, leaves in 27 min.
  assert.deepEqual(
    tiles.map((tile) => [tile.value, tile.color ?? null]),
    [
      ['07:27', 'warning'],
      [27, null],
    ],
  );
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge.text, item.badge.color]),
    [
      ['07:05 → 08:20', 'Supprimé', 'danger'],
      ['07:27 → 08:42', '+7 min', 'warning'],
      ['07:50 → 09:05', 'À l’heure', 'success'],
      ['08:55 → 10:10', '+35 min', 'danger'],
    ],
  );
  assert.equal(list.items[0].description, 'Mouvement social local');
  assert.equal(list.items[1].subtitle, 'TER 858303 · 07:20 → 08:35');
  assert.equal(list.items[2].subtitle, 'TER 858305 · vers Nantes');
});

test('the trip widget names the day of tomorrow’s trains', () => {
  const content = buildTripWidget({
    trip: TRIP,
    snapshot: { trains: TRAINS.slice(2), span: { date: '2026-10-13' }, readAt: NOW },
    threshold: 5,
    busy: false,
    language: 'fr',
    now: NOW - 12 * 60 * MINUTE,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, 300);
  assert.equal(content.components[1].text, 'Trains du mardi 13 octobre');
  // 13 hours ahead: the departure time, no "leaves in 770 min".
  assert.equal(content.components.filter((c) => c.type === 'value').length, 1);
});

test('the trip widget without trains says so', () => {
  const content = buildTripWidget({
    trip: TRIP,
    snapshot: { trains: [], span: {}, readAt: NOW },
    threshold: 5,
    busy: true,
    language: 'en',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components.at(-1).text, 'No train in the followed period of this trip.');
});

test('the board widget renders a real departures board', () => {
  const departures = parseDepartures(capture('departures-paris-lyon.json'));
  const content = buildBoardWidget({
    station: { name: 'Paris Gare de Lyon' },
    departures,
    count: 6,
    threshold: 5,
    language: 'fr',
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const list = content.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 6);
  assert.equal(list.items[0].title, '19:36 Toulon');
  assert.equal(list.items[0].subtitle, 'TGV INOUI 6129');
});

test('the board without departures, and the messages, are valid', () => {
  const empty = buildBoardWidget({
    station: { name: 'Rennes' },
    departures: [],
    count: 6,
    threshold: 5,
    language: 'en',
  });
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.deepEqual(validateWidgetContent(messageContent('x'.repeat(300))), []);
  assert.equal(readCount('12', BOARD_COUNT), BOARD_COUNT.max);
  assert.equal(readCount(undefined, BOARD_COUNT), BOARD_COUNT.default);
});
