// -----------------------------------------------------------------------------
// Scene actions of the SNCF integration.
//
//   - `get_next_trains`  the next train of a trip — times, delay, status,
//                        cause — and a sentence ready to send or speak
//                        ("Rennes → Nantes: the TER 17491 of 07:42 is 5 min
//                        late, leaving at 07:47. Then: 08:12 on time.").
//                        The trains read in the last 2 minutes are reused,
//                        older ones are read again.
// -----------------------------------------------------------------------------

import { t, trainLabel, stateText } from './i18n.js';
import { trainStatus } from './trains.js';
import { formatTime } from './time.js';

const SCENE_ACTIONS = {
  GET_NEXT_TRAINS: 'get_next_trains',
};

/**
 * @description The sentence describing the next trains of a trip.
 * @param {object} trip - The resolved trip.
 * @param {object[]} trains - The followed trains.
 * @param {string} language - The language.
 * @returns {string} The sentence.
 * @example
 * tripSummary(trip, trains, 'fr');
 */
function tripSummary(trip, trains, language) {
  const [first, ...others] = trains;
  if (!first) {
    return t('summaryNone', language, { trip: trip.name });
  }
  const values = {
    trip: trip.name,
    train: trainLabel(first),
    time: formatTime(first.baseDeparture),
    expected: formatTime(first.departure),
    n: first.delay,
    state: stateText(first, language),
  };
  let text = t(
    !first.cancelled && first.delay > 0 ? 'summaryFirstLate' : 'summaryFirst',
    language,
    values,
  );
  if (first.cause && (first.cancelled || first.delay > 0)) {
    text += t('summaryCause', language, { cause: first.cause.slice(0, 300) });
  }
  if (others.length > 0) {
    const list = others
      .slice(0, 3)
      .map((train) => `${formatTime(train.baseDeparture)} ${stateText(train, language)}`)
      .join(', ');
    text += t('summaryNext', language, { list });
  }
  return text;
}

/**
 * @description The outputs of `get_next_trains`.
 * @param {object} options - Options.
 * @param {object} options.trip - The resolved trip.
 * @param {object[]} options.trains - The followed trains.
 * @param {number} options.threshold - The delay threshold (minutes).
 * @param {number} options.now - Now (ms).
 * @param {string} options.language - Language of the summary.
 * @returns {object} The outputs.
 * @example
 * buildNextTrainsOutputs({ trip, trains, threshold: 5, now: Date.now(), language: 'fr' });
 */
function buildNextTrainsOutputs({ trip, trains, threshold, now, language }) {
  const first = trains[0];
  const disrupted = trains.filter((train) => trainStatus(train, threshold) !== 'on_time').length;
  if (!first) {
    return {
      trip_name: trip.name,
      found: false,
      train_number: '',
      train_mode: '',
      scheduled_departure: '',
      expected_departure: '',
      expected_arrival: '',
      delay_minutes: 0,
      status: '',
      cancelled: false,
      minutes_until_departure: 0,
      disrupted_count: 0,
      cause: '',
      summary: tripSummary(trip, trains, language),
    };
  }
  return {
    trip_name: trip.name,
    found: true,
    train_number: first.number,
    train_mode: first.mode,
    scheduled_departure: formatTime(first.baseDeparture),
    expected_departure: formatTime(first.departure),
    expected_arrival: formatTime(first.arrival),
    delay_minutes: first.delay,
    status: trainStatus(first, threshold),
    cancelled: first.cancelled,
    minutes_until_departure: Math.max(0, Math.round((first.departure - now) / 60000)),
    disrupted_count: disrupted,
    cause: first.cause,
    summary: tripSummary(trip, trains, language),
  };
}

export { SCENE_ACTIONS, tripSummary, buildNextTrainsOutputs };
