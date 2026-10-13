import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SCENE_TRIGGERS, DELAY_LEVELS, REMINDER_MINUTES } from '../src/tracker.js';
import { SCENE_ACTIONS, buildNextTrainsOutputs } from '../src/scene-actions.js';
import { WIDGETS, BOARD_COUNT } from '../src/widgets.js';
import {
  MAX_TRIPS,
  DAYS,
  TRAIN_COUNT,
  DELAY_THRESHOLD,
  POLL_INTERVAL,
  IDLE_INTERVAL,
  AUTO_LANGUAGE,
} from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { buildSceneEvent } from '../src/events.js';
import { NOW, MINUTE, TRIP, fakeGladys } from './helpers/fixtures.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');

const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);

const TRAIN = {
  id: `858311@${NOW}`,
  number: '858311',
  mode: 'TER',
  direction: 'Nantes',
  baseDeparture: NOW + 10 * MINUTE,
  departure: NOW + 17 * MINUTE,
  baseArrival: NOW + 85 * MINUTE,
  arrival: NOW + 92 * MINUTE,
  delay: 7,
  cancelled: false,
  cause: 'Panne de signalisation',
};

test('is a device integration, in lockstep with package.json', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${pkg.version}`));
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
});

test('every event carries its filters and exactly its declared variables', () => {
  const events = [
    { key: SCENE_TRIGGERS.TRAIN_DELAYED, train: TRAIN, level: 'minor' },
    { key: SCENE_TRIGGERS.TRAIN_CANCELLED, train: { ...TRAIN, cancelled: true } },
    { key: SCENE_TRIGGERS.DEPARTURE_SOON, train: TRAIN, minutes: 15 },
  ];
  const triggers = byKey(manifest.scene_triggers);
  events.forEach((event) => {
    const { key, data } = buildSceneEvent(fakeGladys, TRIP, event, 'fr');
    const trigger = triggers.get(key);
    trigger.fields.forEach((field) => assert.ok(field.key in data, `${key}.${field.key}`));
    const declared = new Set([
      ...trigger.fields.map((field) => field.key),
      ...trigger.variables.map((variable) => variable.key),
    ]);
    Object.keys(data).forEach((name) => assert.ok(declared.has(name), `${key}: ${name}`));
    trigger.variables.forEach((variable) => {
      assert.ok(variable.key in data, `${key} variable ${variable.key}`);
      assert.equal(typeof data[variable.key], variable.type, `${key}.${variable.key}`);
    });
    // The filters hold values the matcher can compare with the declared options.
    trigger.fields
      .filter((field) => field.options)
      .forEach((field) =>
        assert.ok(values(field).includes(data[field.key]), `${key}.${field.key}`),
      );
    assert.equal(data.trip, 'ext:sncf:trip:87471003-87481002');
  });
});

test('the action resolves exactly its declared outputs, with their types', () => {
  const action = byKey(manifest.scene_actions).get(SCENE_ACTIONS.GET_NEXT_TRAINS);
  [[TRAIN], []].forEach((trains) => {
    const outputs = buildNextTrainsOutputs({
      trip: TRIP,
      trains,
      threshold: 5,
      now: NOW,
      language: 'fr',
    });
    assert.deepEqual(Object.keys(outputs).sort(), action.outputs.map((o) => o.key).sort());
    action.outputs.forEach((output) =>
      assert.equal(typeof outputs[output.key], output.type, output.key),
    );
  });
});

test('mirrors the bounds and values of the code', () => {
  const config = byKey(manifest.config_schema);
  [
    ['train_count', TRAIN_COUNT],
    ['delay_threshold', DELAY_THRESHOLD],
    ['poll_interval', POLL_INTERVAL],
    ['idle_interval', IDLE_INTERVAL],
  ].forEach(([key, bounds]) => {
    ['min', 'max', 'default'].forEach((bound) =>
      assert.equal(config.get(key)[bound], bounds[bound], key),
    );
  });
  for (let slot = 1; slot <= MAX_TRIPS; slot += 1) {
    ['from', 'to', 'hours'].forEach((part) => assert.ok(config.has(`trip_${slot}_${part}`)));
    assert.deepEqual(values(config.get(`trip_${slot}_days`)), DAYS);
  }
  assert.ok(!config.has(`trip_${MAX_TRIPS + 1}_from`));
  const triggers = byKey(manifest.scene_triggers);
  const delayed = byKey(triggers.get(SCENE_TRIGGERS.TRAIN_DELAYED).fields);
  assert.deepEqual(values(delayed.get('delay_level')), DELAY_LEVELS);
  const soon = byKey(triggers.get(SCENE_TRIGGERS.DEPARTURE_SOON).fields);
  assert.deepEqual(values(soon.get('minutes')), REMINDER_MINUTES.map(String));
  const board = byKey(byKey(manifest.widgets).get(WIDGETS.BOARD).settings);
  ['min', 'max', 'default'].forEach((bound) =>
    assert.equal(board.get('count')[bound], BOARD_COUNT[bound]),
  );
});

test('declares the configuration actions the code answers', () => {
  assert.deepEqual(manifest.actions.map((action) => action.key).sort(), [
    'search_station',
    'test_connection',
  ]);
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.equal(field.type, 'select');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
  assert.notEqual(field.required, true, 'an existing configuration has no language');
});
