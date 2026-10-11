import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildNextTrainsOutputs, tripSummary } from '../src/scene-actions.js';
import { buildSceneEvent } from '../src/events.js';
import { SCENE_TRIGGERS } from '../src/tracker.js';
import { NOW, MINUTE, TRIP, fakeGladys } from './helpers/fixtures.js';

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

test('summarizes the next trains in a sentence', () => {
  const trains = [
    train('A', { offset: 42, delay: 5, cause: 'Panne de signalisation' }),
    train('B', { offset: 72 }),
    train('C', { offset: 102, cancelled: true }),
  ];
  assert.equal(
    tripSummary(TRIP, trains, 'fr'),
    'Rennes → Nantes : le TER A de 07:42 a 5 min de retard, départ à 07:47. Motif : Panne de signalisation. Ensuite : 08:12 à l’heure, 08:42 supprimé.',
  );
  assert.equal(
    tripSummary(TRIP, [train('A', { offset: 42 })], 'en'),
    'Rennes → Nantes: the TER A of 07:42 is on time.',
  );
  assert.equal(
    tripSummary(TRIP, [train('A', { offset: 42, cancelled: true, cause: 'Grève' })], 'fr'),
    'Rennes → Nantes : le TER A de 07:42 est supprimé. Motif : Grève.',
  );
  assert.equal(
    tripSummary(TRIP, [], 'fr'),
    'Rennes → Nantes : aucun train trouvé sur la période suivie.',
  );
});

test('outputs the next train', () => {
  const outputs = buildNextTrainsOutputs({
    trip: TRIP,
    trains: [train('A', { offset: 42, delay: 6 }), train('B', { offset: 72, cancelled: true })],
    threshold: 5,
    now: NOW,
    language: 'fr',
  });
  assert.equal(outputs.found, true);
  assert.equal(outputs.scheduled_departure, '07:42');
  assert.equal(outputs.expected_departure, '07:48');
  assert.equal(outputs.status, 'delayed');
  assert.equal(outputs.minutes_until_departure, 48);
  assert.equal(outputs.disrupted_count, 2);
});

test('the scene events carry a ready-made sentence', () => {
  const delayed = buildSceneEvent(
    fakeGladys,
    TRIP,
    {
      key: SCENE_TRIGGERS.TRAIN_DELAYED,
      train: train('A', { offset: 42, delay: 18, cause: 'Accident' }),
      level: 'major',
    },
    'fr',
  );
  assert.equal(delayed.data.delay_level, 'major');
  assert.equal(
    delayed.data.summary,
    'Rennes → Nantes : le TER A de 07:42 a 18 min de retard, départ à 08:00. Motif : Accident.',
  );
  const soon = buildSceneEvent(
    fakeGladys,
    TRIP,
    {
      key: SCENE_TRIGGERS.DEPARTURE_SOON,
      train: train('A', { offset: 10, delay: 5 }),
      minutes: 15,
    },
    'en',
  );
  assert.equal(soon.data.minutes, '15');
  assert.equal(
    soon.data.summary,
    'Rennes → Nantes: the TER A leaves in 15 min, at 07:15 (5 min late).',
  );
});
