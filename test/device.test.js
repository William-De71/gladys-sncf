import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildDevice,
  buildStates,
  tripKey,
  tripFromExternalId,
  FEATURE_KEYS,
} from '../src/device.js';
import { NOW, MINUTE, TRIP, fakeGladys, RENNES, NANTES } from './helpers/fixtures.js';

const train = (number, { delay = 0, cancelled = false, offset = 10 } = {}) => ({
  id: `${number}@${NOW + offset * MINUTE}`,
  number,
  mode: 'TER',
  baseDeparture: NOW + offset * MINUTE,
  departure: NOW + (offset + delay) * MINUTE,
  delay,
  cancelled,
});

test('builds the trip key from the UIC codes', () => {
  assert.equal(tripKey({ id: RENNES }, { id: NANTES }), '87471003-87481002');
  assert.equal(
    tripKey({ id: 'stop_area:OCE:Foo-Bar' }, { id: NANTES }),
    'stop_area_oce_foo_bar-87481002',
  );
});

test('finds the trip of a device or a feature', () => {
  const device = buildDevice(fakeGladys, TRIP, 'fr');
  assert.equal(tripFromExternalId(device.external_id, [TRIP]), TRIP);
  assert.equal(tripFromExternalId(`${device.external_id}:delay`, [TRIP]), TRIP);
  assert.equal(tripFromExternalId('ext:sncf:trip:1-2', [TRIP]), null);
  assert.equal(tripFromExternalId(undefined, [TRIP]), null);
});

test('offers a device with three read-only features of the core taxonomy', () => {
  const device = buildDevice(fakeGladys, TRIP, 'fr');
  assert.equal(device.name, 'SNCF – Rennes → Nantes');
  assert.equal(device.external_id, 'ext:sncf:trip:87471003-87481002');
  const byKey = new Map(device.features.map((f) => [f.external_id.split(':').pop(), f]));
  assert.deepEqual([...byKey.keys()], Object.values(FEATURE_KEYS));
  assert.equal(byKey.get('next').category, DEVICE_FEATURE_CATEGORIES.TEXT);
  assert.equal(byKey.get('next').type, DEVICE_FEATURE_TYPES.TEXT.TEXT);
  assert.equal(byKey.get('delay').category, DEVICE_FEATURE_CATEGORIES.DURATION);
  assert.equal(byKey.get('delay').type, DEVICE_FEATURE_TYPES.DURATION.INTEGER);
  assert.equal(byKey.get('delay').unit, DEVICE_FEATURE_UNITS.MINUTES);
  assert.equal(byKey.get('disrupted').category, DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR);
  device.features.forEach((feature) => assert.equal(feature.read_only, true));
});

test('publishes the next train, the delay of the next running one, the disrupted count', () => {
  const states = buildStates(
    fakeGladys,
    TRIP,
    [
      train('A', { cancelled: true }),
      train('B', { delay: 7, offset: 30 }),
      train('C', { delay: 2, offset: 60 }),
    ],
    { threshold: 5, language: 'fr' },
  );
  const byKey = new Map(states.map((s) => [s.device_feature_external_id.split(':').pop(), s]));
  assert.equal(byKey.get('next').text, '07:10 · TER A · supprimé');
  assert.equal(byKey.get('delay').state, 7);
  assert.equal(byKey.get('disrupted').state, 2);
});

test('never publishes a fake on-time delay without a train', () => {
  const states = buildStates(fakeGladys, TRIP, [], { threshold: 5, language: 'en' });
  assert.deepEqual(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.text ?? s.state]),
    [
      ['next', 'No train'],
      ['disrupted', 0],
    ],
  );
});
