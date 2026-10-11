// -----------------------------------------------------------------------------
// The data of the scene events.
//
// `data` is flat: the core matches the trigger filters on the keys named like
// the declared `fields` (`trip`: the device external id, `delay_level`,
// `minutes`), and exposes the declared `variables` to the scene
// ({{triggerEvent.data.summary}}). Every other key would be dropped: each
// trigger gets exactly its declared keys (see the manifest test).
// -----------------------------------------------------------------------------

import { idsOf } from './device.js';
import { SCENE_TRIGGERS } from './tracker.js';
import { t, trainLabel } from './i18n.js';
import { formatTime, parisDate } from './time.js';

/**
 * @description The variables every trigger shares.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} trip - The resolved trip.
 * @param {object} train - The train.
 * @returns {object} The data.
 */
function trainData(gladys, trip, train) {
  return {
    trip: idsOf(gladys, trip).device,
    trip_name: trip.name,
    train_number: train.number,
    train_mode: train.mode,
    direction: train.direction,
    departure_date: parisDate(train.baseDeparture),
    scheduled_departure: formatTime(train.baseDeparture),
    expected_departure: formatTime(train.departure),
    expected_arrival: formatTime(train.arrival),
  };
}

/**
 * @description The " Cause: …" part of a summary.
 * @param {object} train - The train.
 * @param {string} language - The language.
 * @returns {string} The text, '' without a cause.
 */
function causeText(train, language) {
  return train.cause ? t('summaryCause', language, { cause: train.cause.slice(0, 300) }) : '';
}

/**
 * @description Build the scene event of something that happened to a train.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} trip - The resolved trip.
 * @param {{ key: string, train: object, level?: string, minutes?: number }} event - The event.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The trigger key and its data.
 * @example
 * await gladys.publishSceneEvent(...Object.values(buildSceneEvent(gladys, trip, event, 'fr')));
 */
function buildSceneEvent(gladys, trip, event, language) {
  const { train } = event;
  const base = trainData(gladys, trip, train);
  const values = {
    trip: trip.name,
    train: trainLabel(train),
    time: base.scheduled_departure,
    expected: base.expected_departure,
    n: train.delay,
    cause: causeText(train, language),
  };
  if (event.key === SCENE_TRIGGERS.TRAIN_CANCELLED) {
    return {
      key: event.key,
      data: { ...base, cause: train.cause, summary: t('summaryCancelled', language, values) },
    };
  }
  if (event.key === SCENE_TRIGGERS.TRAIN_DELAYED) {
    return {
      key: event.key,
      data: {
        ...base,
        delay_level: event.level,
        delay_minutes: train.delay,
        cause: train.cause,
        summary: t('summaryDelayed', language, values),
      },
    };
  }
  return {
    key: SCENE_TRIGGERS.DEPARTURE_SOON,
    data: {
      ...base,
      minutes: String(event.minutes),
      delay_minutes: train.delay,
      summary: t('summaryReminder', language, {
        ...values,
        minutes: event.minutes,
        late: train.delay > 0 ? t('reminderLate', language, { n: train.delay }) : '',
      }),
    },
  };
}

export { buildSceneEvent };
