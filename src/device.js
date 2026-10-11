// -----------------------------------------------------------------------------
// The "SNCF – <from> → <to>" devices.
//
// One device per configured trip, offered on the Discovery screen. It brings
// what only the core offers: the history of the delays (chart box), the
// dashboard device box, and scenes on a value ("the next train is more than
// 10 minutes late", "a train of my trip is disrupted").
//
// Features, all read-only:
//   - `next`       text: the next train, "07:42 · TER 17491 · +5 min";
//   - `delay`      duration (minutes): the delay of the next train that
//                  runs, 0 when on time;
//   - `disrupted`  counter: the followed trains that are delayed (from the
//                  delay threshold) or cancelled.
//
// The external id is built on the UIC codes of both stations
// ("ext:sncf:trip:87471003-87481002"): retyping a station differently keeps
// the device, choosing another station makes a new one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t, nextLine } from './i18n.js';
import { trainStatus, uicOf } from './trains.js';

const DEVICE_TYPE = 'trip';
const FEATURE_KEYS = {
  NEXT: 'next',
  DELAY: 'delay',
  DISRUPTED: 'disrupted',
};
const MAX_DELAY = 1440;
const MAX_DISRUPTED = 20;

/**
 * @description The identifier of a trip, from its stations.
 * @param {{ id: string }} from - The departure station.
 * @param {{ id: string }} to - The arrival station.
 * @returns {string} "87471003-87481002".
 * @example
 * tripKey({ id: 'stop_area:SNCF:87471003' }, { id: 'stop_area:SNCF:87481002' });
 */
function tripKey(from, to) {
  const part = (station) =>
    uicOf(station.id) ||
    String(station.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
  return `${part(from)}-${part(to)}`;
}

/**
 * @description The external ids of a trip.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} trip - The resolved trip (`key`).
 * @returns {{ device: string, feature: Function }} The ids.
 */
function idsOf(gladys, trip) {
  return gladys.externalIds(DEVICE_TYPE, trip.key);
}

/**
 * @description The trip a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @param {object[]} trips - The resolved trips.
 * @returns {object|null} The trip, null when not configured any more.
 * @example
 * tripFromExternalId('ext:sncf:trip:87471003-87481002', trips);
 */
function tripFromExternalId(externalId, trips) {
  const match = /:trip:([a-z0-9_]+-[a-z0-9_]+)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  if (!match) {
    return null;
  }
  return trips.find((trip) => trip.key === match[1]) ?? null;
}

/**
 * @description A read-only feature.
 * @param {object} feature - Its fields.
 * @returns {object} The feature.
 */
function sensor(feature) {
  return { read_only: true, has_feedback: false, keep_history: true, ...feature };
}

/**
 * @description Build the device of a trip.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} trip - The resolved trip (`key`, `name`, `from`, `to`).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 * @example
 * await gladys.publishDiscoveredDevices([buildDevice(gladys, trip, 'fr')]);
 */
function buildDevice(gladys, trip, language = 'en') {
  const ids = idsOf(gladys, trip);
  return {
    name: t('deviceName', language, { trip: trip.name }),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'SNCF_FROM', value: trip.from.id },
      { name: 'SNCF_TO', value: trip.to.id },
    ],
    features: [
      sensor({
        name: t('featureNext', language),
        external_id: ids.feature(FEATURE_KEYS.NEXT),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        keep_history: false,
        min: 0,
        max: 0,
      }),
      sensor({
        name: t('featureDelay', language),
        external_id: ids.feature(FEATURE_KEYS.DELAY),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.MINUTES,
        min: 0,
        max: MAX_DELAY,
      }),
      sensor({
        name: t('featureDisrupted', language),
        external_id: ids.feature(FEATURE_KEYS.DISRUPTED),
        category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: 0,
        max: MAX_DISRUPTED,
      }),
    ],
  };
}

/**
 * @description The states of a trip. Without any train (a timetable gap, the
 * API failing), the delay is left untouched: a 0 would fake an on-time train.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} trip - The resolved trip.
 * @param {object[]} trains - The followed trains.
 * @param {object} options - Options.
 * @param {number} options.threshold - The delay threshold (minutes).
 * @param {string} options.language - Language of the text.
 * @returns {Array<object>} The states.
 * @example
 * await gladys.publishStates(buildStates(gladys, trip, trains, { threshold: 5, language: 'fr' }));
 */
function buildStates(gladys, trip, trains, { threshold, language }) {
  const ids = idsOf(gladys, trip);
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.NEXT),
      text: nextLine(trains[0], language),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.DISRUPTED),
      state: Math.min(
        MAX_DISRUPTED,
        trains.filter((train) => trainStatus(train, threshold) !== 'on_time').length,
      ),
    },
  ];
  const running = trains.find((train) => !train.cancelled);
  if (running) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.DELAY),
      state: Math.min(MAX_DELAY, running.delay),
    });
  }
  return states;
}

export { DEVICE_TYPE, FEATURE_KEYS, tripKey, idsOf, tripFromExternalId, buildDevice, buildStates };
