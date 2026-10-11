import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseJourneys,
  mergeTrains,
  confirmSuspected,
  parseDepartures,
  trainStatus,
  plainText,
  uicOf,
  cleanDirection,
} from '../src/trains.js';
import {
  NOW,
  MINUTE,
  RENNES,
  NANTES,
  capture,
  rawJourney,
  rawDisruption,
  rawDeparture,
  journeysAnswer,
} from './helpers/fixtures.js';

const stations = { from: RENNES, to: NANTES };

test('reads a real delayed journey: the train is the public transport section', () => {
  const [train] = parseJourneys(capture('journey-delayed.json'));
  assert.equal(train.number, '17491');
  assert.equal(train.mode, 'TER');
  assert.equal(train.direction, 'Nice');
  assert.equal(train.delay, 35);
  assert.equal(train.arrivalDelay, 35);
  assert.equal(train.cancelled, false);
  assert.equal(train.cause, "Panne d'un aiguillage");
  assert.equal(train.effect, 'SIGNIFICANT_DELAYS');
  assert.equal(train.baseDeparture, Date.parse('2023-05-20T17:14:00Z'));
});

test('leaves out the journeys with a change', () => {
  const journey = rawJourney({ baseDeparture: NOW });
  journey.sections.splice(2, 0, { ...journey.sections[1] });
  assert.deepEqual(parseJourneys(journeysAnswer([journey])), []);
});

test('links a cancellation by the train number and its day', () => {
  const answer = journeysAnswer(
    [rawJourney({ number: '858311', baseDeparture: NOW + 30 * MINUTE })],
    [
      rawDisruption({ number: '858311', date: '2026-10-12' }),
      rawDisruption({ id: 'd2', number: '858311', date: '2026-10-13' }),
    ],
  );
  const [train] = parseJourneys(answer, stations);
  assert.equal(train.cancelled, true);
  assert.equal(train.cause, 'Mouvement social');
  const otherDay = journeysAnswer(
    [rawJourney({ number: '858311', baseDeparture: NOW + 30 * MINUTE })],
    [rawDisruption({ number: '858311', date: '2026-10-13' })],
  );
  assert.equal(parseJourneys(otherDay, stations)[0].cancelled, false);
});

test('a train no longer stopping at a station of the trip is cancelled for it', () => {
  const disruption = rawDisruption({
    effect: 'REDUCED_SERVICE',
    text: '<p>Arrêt supprimé à Nantes</p>',
    impactedStops: [
      {
        stop_point: { id: 'stop_point:SNCF:87481002:Train' },
        departure_status: 'unchanged',
        arrival_status: 'deleted',
      },
    ],
  });
  const [train] = parseJourneys(
    journeysAnswer([rawJourney({ baseDeparture: NOW, disruptions: ['d1'] })], [disruption]),
    stations,
  );
  assert.equal(train.cancelled, true);
  assert.equal(train.cause, 'Arrêt supprimé à Nantes');
});

test('merges the timetable and the real time', () => {
  const base = parseJourneys(
    journeysAnswer([
      rawJourney({ number: 'A', baseDeparture: NOW }),
      rawJourney({ number: 'B', baseDeparture: NOW + 30 * MINUTE }),
      rawJourney({ number: 'C', baseDeparture: NOW + 60 * MINUTE }),
      rawJourney({ number: 'D', baseDeparture: NOW + 90 * MINUTE }),
    ]),
  );
  const live = parseJourneys(
    journeysAnswer([
      rawJourney({ number: 'A', baseDeparture: NOW, delay: 7 }),
      rawJourney({ number: 'C', baseDeparture: NOW + 60 * MINUTE }),
    ]),
  );
  const merged = mergeTrains(base, live);
  assert.deepEqual(
    merged.map((train) => [train.number, train.delay, train.suspected]),
    [
      ['A', 7, false],
      ['B', 0, true], // missing while a later train is there
      ['C', 0, false],
      ['D', 0, false], // missing at the end of the page: unknown, kept
    ],
  );
});

test('keeps the cancellation the timetable knows when the real time misses it', () => {
  const base = parseJourneys(
    journeysAnswer(
      [rawJourney({ number: 'A', baseDeparture: NOW })],
      [rawDisruption({ number: 'A' })],
    ),
  );
  const live = parseJourneys(journeysAnswer([rawJourney({ number: 'A', baseDeparture: NOW })]));
  const [train] = mergeTrains(base, live);
  assert.equal(train.cancelled, true);
  assert.equal(train.cause, 'Mouvement social');
});

test('settles the suspected trains on the departures board', () => {
  const suspected = (number, offset) => ({
    id: `${number}@${NOW + offset}`,
    number,
    baseDeparture: NOW + offset,
    departure: NOW + offset,
    baseArrival: NOW + offset + 75 * MINUTE,
    arrival: NOW + offset + 75 * MINUTE,
    delay: 0,
    cancelled: false,
    suspected: true,
    cause: '',
  });
  const board = {
    departures: [rawDeparture({ number: 'B', baseDeparture: NOW + 30 * MINUTE, delay: 70 })],
    disruptions: [],
  };
  const [late, gone] = confirmSuspected(
    [suspected('B', 30 * MINUTE), suspected('E', 40 * MINUTE)],
    board,
  );
  assert.equal(late.cancelled, false);
  assert.equal(late.delay, 70);
  assert.equal(late.arrival, NOW + 30 * MINUTE + 75 * MINUTE + 70 * MINUTE);
  assert.equal(gone.cancelled, true);
  // A full page that does not reach the train proves nothing.
  const full = {
    departures: Array.from({ length: 5 }, () => rawDeparture({ number: 'Z', baseDeparture: NOW })),
  };
  assert.equal(confirmSuspected([suspected('E', 40 * MINUTE)], full, 5)[0].cancelled, false);
  // No board: never a cancellation on a guess.
  assert.equal(confirmSuspected([suspected('E', 40 * MINUTE)], null)[0].cancelled, false);
});

test('reads a real departures board', () => {
  const departures = parseDepartures(capture('departures-paris-lyon.json'));
  assert.equal(departures.length, 12);
  assert.deepEqual(
    departures.slice(0, 2).map((d) => [d.number, d.mode, d.direction, d.delay, d.cancelled]),
    [
      ['6129', 'TGV INOUI', 'Toulon', 0, false],
      ['6927', 'TGV', 'Grenoble', 0, false],
    ],
  );
});

test('a board departure linked to a NO_SERVICE disruption is cancelled', () => {
  const [departure] = parseDepartures({
    departures: [rawDeparture({ number: 'A', baseDeparture: NOW, disruptions: ['d1'] })],
    disruptions: [rawDisruption({ number: 'A' })],
  });
  assert.equal(departure.cancelled, true);
});

test('states, texts and identifiers', () => {
  assert.equal(trainStatus({ cancelled: true, delay: 0 }, 5), 'cancelled');
  assert.equal(trainStatus({ cancelled: false, delay: 5 }, 5), 'delayed');
  assert.equal(trainStatus({ cancelled: false, delay: 4 }, 5), 'on_time');
  assert.equal(plainText('<p>Panne&nbsp;d&#39;un <b>aiguillage</b></p>'), "Panne d'un aiguillage");
  assert.equal(uicOf('stop_point:SNCF:87471003:LongDistanceTrain'), '87471003');
  assert.equal(uicOf('admin:fr:35238'), '');
  assert.equal(
    cleanDirection('Paris - Montparnasse - Hall 1 & 2 (Paris)'),
    'Paris - Montparnasse - Hall 1 & 2',
  );
});
