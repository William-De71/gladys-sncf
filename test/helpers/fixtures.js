// Shapes of the SNCF API answers (as in the real captures of test/fixtures),
// and a stand-in for the SDK external ids.

import { readFileSync } from 'node:fs';
import { toNavitiaDate } from '../../src/time.js';

// Monday 12 October 2026, 07:00 in Paris.
export const NOW = Date.parse('2026-10-12T05:00:00Z');
export const MINUTE = 60000;

export const RENNES = 'stop_area:SNCF:87471003';
export const NANTES = 'stop_area:SNCF:87481002';

export const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:sncf:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
  externalId: (suffix) => `ext:sncf:${suffix}`,
};

export const TRIP = {
  slot: 1,
  key: '87471003-87481002',
  name: 'Rennes → Nantes',
  from: { id: RENNES, name: 'Rennes' },
  to: { id: NANTES, name: 'Nantes' },
  hours: null,
  days: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * @description Read a real capture.
 * @param {string} name - The file name in test/fixtures.
 * @returns {object} The answer.
 */
export function capture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

/**
 * @description A direct journey of a /journeys answer.
 * @param {object} options - Options.
 * @returns {object} The raw journey.
 */
export function rawJourney({
  number = '858311',
  mode = 'TER',
  baseDeparture,
  delay = 0,
  duration = 75,
  arrivalDelay = delay,
  disruptions = [],
  from = RENNES,
  to = NANTES,
}) {
  const departure = baseDeparture + delay * MINUTE;
  const baseArrival = baseDeparture + duration * MINUTE;
  const arrival = baseArrival + arrivalDelay * MINUTE;
  const point = (area) => ({
    id: `${area.replace('stop_area', 'stop_point')}:Train`,
    embedded_type: 'stop_point',
    stop_point: { stop_area: { id: area } },
  });
  return {
    nb_transfers: 0,
    status: delay > 0 ? 'SIGNIFICANT_DELAYS' : '',
    departure_date_time: toNavitiaDate(departure),
    arrival_date_time: toNavitiaDate(arrival),
    sections: [
      { type: 'crow_fly', duration: 0 },
      {
        type: 'public_transport',
        data_freshness: 'realtime',
        from: point(from),
        to: point(to),
        departure_date_time: toNavitiaDate(departure),
        base_departure_date_time: toNavitiaDate(baseDeparture),
        arrival_date_time: toNavitiaDate(arrival),
        base_arrival_date_time: toNavitiaDate(baseArrival),
        display_informations: {
          commercial_mode: mode,
          network: mode,
          direction: 'Nantes (Nantes)',
          headsign: number,
          trip_short_name: number,
          links: disruptions.map((id) => ({ type: 'disruption', rel: 'disruptions', id })),
        },
      },
      { type: 'crow_fly', duration: 0 },
    ],
  };
}

/**
 * @description A disruption of an answer.
 * @param {object} options - Options.
 * @returns {object} The raw disruption.
 */
export function rawDisruption({
  id = 'd1',
  effect = 'NO_SERVICE',
  text = 'Mouvement social',
  number = '858311',
  date = '2026-10-12',
  impactedStops = [],
}) {
  return {
    id,
    status: 'active',
    severity: { name: effect === 'NO_SERVICE' ? 'trip canceled' : 'trip delayed', effect },
    messages: text ? [{ text, channel: { name: 'rt' } }] : [],
    impacted_objects: [
      {
        pt_object: {
          id: `SNCF:${date}:${number}:1187:Train`,
          name: `SNCF:${date}:${number}:1187:Train`,
          embedded_type: 'trip',
        },
        impacted_stops: impactedStops,
      },
    ],
  };
}

/**
 * @description A /journeys answer.
 * @param {object[]} journeys - The raw journeys.
 * @param {object[]} [disruptions] - The raw disruptions.
 * @returns {object} The answer.
 */
export function journeysAnswer(journeys, disruptions = []) {
  return { context: { timezone: 'Europe/Paris' }, journeys, disruptions };
}

/**
 * @description A departure of a /departures answer.
 * @param {object} options - Options.
 * @returns {object} The raw departure.
 */
export function rawDeparture({
  number,
  baseDeparture,
  delay = 0,
  direction = 'Nantes (Nantes)',
  disruptions = [],
}) {
  return {
    display_informations: {
      commercial_mode: 'TER',
      direction,
      headsign: number,
      trip_short_name: number,
      links: disruptions.map((id) => ({ type: 'disruption', id })),
    },
    stop_date_time: {
      departure_date_time: toNavitiaDate(baseDeparture + delay * MINUTE),
      base_departure_date_time: toNavitiaDate(baseDeparture),
      data_freshness: 'realtime',
    },
  };
}

/**
 * @description A fake SNCF client answering from a script.
 * @param {object} answers - `{ base, realtime, departures }`, values or functions.
 * @returns {object} The client, with `calls`.
 */
export function fakeSncf(answers) {
  const calls = [];
  const answer = (value, args) => {
    const result = typeof value === 'function' ? value(args) : value;
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  };
  return {
    calls,
    journeys: (args) => {
      calls.push({ kind: args.freshness, ...args });
      return answer(args.freshness === 'realtime' ? answers.realtime : answers.base, args);
    },
    departures: (args) => {
      calls.push({ kind: 'departures', ...args });
      return answer(answers.departures ?? { departures: [] }, args);
    },
  };
}
