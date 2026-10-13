import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { LANGUAGES, TEXTS, all, t } from '../src/i18n.js';
import { buildTripWidget, buildBoardWidget, messageContent } from '../src/widgets.js';
import { buildNextTrainsOutputs } from '../src/scene-actions.js';
import { buildSceneEvent } from '../src/events.js';
import { buildDevice } from '../src/device.js';
import { parseDepartures } from '../src/trains.js';
import { NOW, MINUTE, TRIP, fakeGladys, capture } from './helpers/fixtures.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../gladys-assistant-integration.json'));

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
];

/**
 * @description Every multi-language object of the manifest, with its path.
 * @param {unknown} node - A manifest node.
 * @param {string} path - Its path.
 * @returns {Array<[string, object]>} The texts.
 */
function texts(node, path = '') {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => texts(child, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      return [[path, node]];
    }
    return Object.entries(node).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

test('every manifest text exists in English, French, German and Spanish', () => {
  const found = texts(manifest);
  assert.ok(found.length > 50);
  for (const [path, text] of found) {
    for (const language of LANGUAGES) {
      assert.ok(text[language]?.trim(), `${path}.${language} is missing`);
    }
  }
});

test('catalog description: 10 to 100 characters per language', () => {
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length}`);
  }
});

test('widget labels: 3 to 30 characters per language', () => {
  for (const widget of manifest.widgets) {
    for (const language of LANGUAGES) {
      const { length } = widget.label[language];
      assert.ok(length >= 3 && length <= 30, `${widget.key}.label.${language}: ${length}`);
    }
  }
});

test('every runtime text exists in the four languages, with the same placeholders', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, entry] of Object.entries(TEXTS)) {
    for (const language of LANGUAGES) {
      assert.ok(entry[language], `${key}.${language} is missing`);
      assert.deepEqual(placeholders(entry[language]), placeholders(entry.en), `${key}.${language}`);
    }
  }
  assert.deepEqual(Object.keys(all('statusNoTrip')), LANGUAGES);
});

test('connection status messages stay within 200 characters per language', () => {
  const values = { time: '23:59', used: 4999, trips: 3, names: 'x'.repeat(60) };
  for (const key of Object.keys(TEXTS).filter((name) => name.startsWith('status'))) {
    for (const [language, text] of Object.entries(all(key, values))) {
      assert.ok(text.length <= 200, `${key}.${language}: ${text.length}`);
    }
  }
});

test('the widgets are valid in every language', () => {
  const departures = parseDepartures(capture('departures-paris-lyon.json'));
  for (const language of LANGUAGES) {
    for (const content of [
      buildTripWidget({
        trip: TRIP,
        // The trains of another day: the caption names that day.
        snapshot: { trains: TRAINS, span: { date: '2026-10-13' }, readAt: NOW },
        threshold: 5,
        busy: true,
        language,
        now: NOW,
      }),
      buildTripWidget({
        trip: TRIP,
        snapshot: { trains: [], span: { date: '2026-10-12' }, readAt: NOW },
        threshold: 5,
        busy: false,
        language,
        now: NOW,
      }),
      buildBoardWidget({
        station: { name: 'Paris Gare de Lyon' },
        departures,
        count: 6,
        threshold: 5,
        language,
      }),
      messageContent(t('noApiKey', language)),
    ]) {
      assert.deepEqual(validateWidgetContent(content), [], language);
    }
  }
});

test('device names, dates and scene texts follow the language', () => {
  assert.equal(buildDevice(fakeGladys, TRIP, 'de').features[0].name, 'Nächster Zug');
  assert.equal(buildDevice(fakeGladys, TRIP, 'es').features[0].name, 'Próximo tren');
  const caption = (language) =>
    buildTripWidget({
      trip: TRIP,
      snapshot: { trains: TRAINS, span: { date: '2026-10-13' }, readAt: NOW },
      threshold: 5,
      busy: true,
      language,
      now: NOW,
    }).components[1].text;
  assert.equal(caption('de'), 'Züge am Dienstag, 13. Oktober');
  assert.equal(caption('es'), 'Trenes del martes, 13 de octubre');
  const outputs = buildNextTrainsOutputs({
    trip: TRIP,
    trains: TRAINS.slice(1),
    threshold: 5,
    now: NOW,
    language: 'de',
  });
  assert.match(outputs.summary, /hat 7 min Verspätung/);
  const { data } = buildSceneEvent(
    fakeGladys,
    TRIP,
    { key: 'train_cancelled', train: TRAINS[0] },
    'es',
  );
  assert.match(data.summary, /está cancelado/);
  // Unknown language: English.
  assert.equal(t('featureNext', 'it'), 'Next train');
});
