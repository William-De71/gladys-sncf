// -----------------------------------------------------------------------------
// Trains, read from the answers of the SNCF API.
//
// A journey between two stop areas is framed by two zero-length `crow_fly`
// sections: the train is THE `public_transport` section, never `sections[0]`.
// A journey with a change (two public transport sections) is not a direct
// train and is left out.
//
// Delays: the `departure_date_time` of the section minus its
// `base_departure_date_time` (same at the arrival).
//
// Cancellations: a cancelled train (disruption effect NO_SERVICE) VANISHES
// from the real-time answers. So a round reads both the theoretical timetable
// (base_schedule, where the train stays, linked to its disruption) and the
// real-time one, then merges them by train (number + theoretical departure):
//   - in both                    -> the real-time version;
//   - theoretical only, linked to a NO_SERVICE disruption -> cancelled;
//   - theoretical only, while a LATER train is in real time -> suspected
//     cancelled: it may as well be so late it left the page. The departures
//     board of the station settles it (confirmSuspected);
//   - theoretical only, nothing later -> kept as is (end of the page).
// A train whose stop at our departure (or arrival) station is deleted
// (REDUCED_SERVICE) does not serve the trip: cancelled for it, too.
//
// The approach is the one of the Home Assistant integration
// glorp-fr/glorp_sncf_trajets, the most thorough on cancellations.
// -----------------------------------------------------------------------------

import { parseNavitiaDate, parisDate } from './time.js';

const EFFECTS = {
  NO_SERVICE: 'NO_SERVICE',
  REDUCED_SERVICE: 'REDUCED_SERVICE',
  SIGNIFICANT_DELAYS: 'SIGNIFICANT_DELAYS',
  DETOUR: 'DETOUR',
  ADDITIONAL_SERVICE: 'ADDITIONAL_SERVICE',
  MODIFIED_SERVICE: 'MODIFIED_SERVICE',
};

// The board page of the station proves a train absent when it is not full,
// or when it reaches this far past the train.
const DEPARTURES_COUNT = 100;
const CONCLUSIVE_SPAN_MS = 3 * 3600 * 1000;
const SERVICE_DATE_REGEX = /:(\d{4}-\d{2}-\d{2}):/;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * @description Turn a message of the API (it may carry HTML) into plain text.
 * @param {unknown} value - The text.
 * @returns {string} The plain text.
 * @example
 * plainText('<p>Panne d&#39;un aiguillage</p>'); // -> "Panne d'un aiguillage"
 */
function plainText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&([a-z]+|#39);/gi, (entity, name) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @description The UIC code of a stop area or stop point id.
 * @param {unknown} id - "stop_area:SNCF:87471003", "stop_point:SNCF:87471003:Train".
 * @returns {string} The code, '' when none.
 * @example
 * uicOf('stop_point:SNCF:87471003:Train'); // -> '87471003'
 */
function uicOf(id) {
  const match = /:(\d{7,9})(?::|$)/.exec(String(id ?? ''));
  return match ? match[1] : '';
}

/**
 * @description A direction without its city in brackets.
 * @param {unknown} value - "Nice (Nice)".
 * @returns {string} "Nice".
 * @example
 * cleanDirection('Paris - Montparnasse - Hall 1 & 2 (Paris)'); // -> 'Paris - Montparnasse - Hall 1 & 2'
 */
function cleanDirection(value) {
  return String(value ?? '')
    .replace(/\s*\([^()]*\)\s*$/, '')
    .trim();
}

/**
 * @description The commercial name of a train: TER, TGV INOUI, OUIGO, BreizhGo…
 * @param {object} info - The `display_informations`.
 * @returns {string} The mode.
 */
function modeOf(info) {
  const mode = String(info?.commercial_mode || info?.network || info?.physical_mode || '').trim();
  return /^region/i.test(mode) ? 'TER' : mode;
}

/**
 * @description The first readable message of disruptions.
 * @param {object[]} disruptions - The disruptions.
 * @returns {string} The message, '' when none.
 */
function causeOf(disruptions) {
  for (const disruption of disruptions) {
    for (const message of disruption?.messages ?? []) {
      const text = plainText(message?.text);
      if (text) {
        return text;
      }
    }
    for (const object of disruption?.impacted_objects ?? []) {
      for (const stop of object?.impacted_stops ?? []) {
        const text = plainText(stop?.cause);
        if (text) {
          return text;
        }
      }
    }
    const cause = plainText(disruption?.cause);
    if (cause) {
      return cause;
    }
  }
  return '';
}

/**
 * @description Whether a disruption targets a train, by its number and its day.
 * @param {object} disruption - The disruption.
 * @param {string} number - The train number.
 * @param {number} baseDeparture - Its theoretical departure (ms).
 * @returns {boolean} True when an impacted trip is this train.
 */
function targetsTrain(disruption, number, baseDeparture) {
  if (!number) {
    return false;
  }
  return (disruption?.impacted_objects ?? []).some((object) => {
    const pt = object?.pt_object ?? {};
    if (!['trip', 'vehicle_journey'].includes(pt.embedded_type)) {
      return false;
    }
    const id = String(pt.id ?? '');
    const name = String(pt.name ?? '');
    if (name !== number && !id.includes(`:${number}:`) && !name.includes(`:${number}:`)) {
      return false;
    }
    const day = SERVICE_DATE_REGEX.exec(id) ?? SERVICE_DATE_REGEX.exec(name);
    return !day || day[1] === parisDate(baseDeparture);
  });
}

/**
 * @description Whether a disruption deletes the stop of a train at a station.
 * @param {object} disruption - The disruption.
 * @param {string} uic - The UIC code of the station.
 * @param {'departure'|'arrival'} side - Which stop time.
 * @returns {boolean} True when the train no longer stops there.
 */
function deletesStop(disruption, uic, side) {
  if (!uic) {
    return false;
  }
  return (disruption?.impacted_objects ?? []).some((object) =>
    (object?.impacted_stops ?? []).some(
      (stop) =>
        uicOf(stop?.stop_point?.id) === uic &&
        (stop?.[`${side}_status`] === 'deleted' || stop?.stop_time_effect === 'deleted'),
    ),
  );
}

/**
 * @description Read the disruptions linked to a train.
 * @param {object} info - Its `display_informations`.
 * @param {Map<string, object>} byId - The disruptions of the answer by id.
 * @param {object[]} all - Every disruption of the answer.
 * @param {string} number - The train number.
 * @param {number} baseDeparture - Its theoretical departure.
 * @returns {object[]} The disruptions.
 */
function linkedDisruptions(info, byId, all, number, baseDeparture) {
  const linked = (info?.links ?? [])
    .filter((link) => link?.type === 'disruption' && byId.has(link.id))
    .map((link) => byId.get(link.id));
  all.forEach((disruption) => {
    if (!linked.includes(disruption) && targetsTrain(disruption, number, baseDeparture)) {
      linked.push(disruption);
    }
  });
  return linked;
}

/**
 * @description Minutes between two instants, rounded.
 * @param {number} actual - The real-time instant.
 * @param {number} base - The theoretical instant.
 * @returns {number} The minutes (never negative: an early train is on time).
 */
function minutesLate(actual, base) {
  return Math.max(0, Math.round((actual - base) / 60000));
}

/**
 * @description Read the direct trains of a /journeys answer.
 * @param {object} answer - The answer.
 * @param {object} [stations] - The trip stations, to spot deleted stops.
 * @param {string} [stations.from] - The departure stop area id.
 * @param {string} [stations.to] - The arrival stop area id.
 * @returns {object[]} The trains, by theoretical departure.
 * @example
 * parseJourneys(answer, { from: 'stop_area:SNCF:87471003', to: 'stop_area:SNCF:87481002' });
 */
function parseJourneys(answer, { from = '', to = '' } = {}) {
  const disruptions = Array.isArray(answer?.disruptions) ? answer.disruptions : [];
  const byId = new Map(disruptions.map((disruption) => [disruption?.id, disruption]));
  const fromUic = uicOf(from);
  const toUic = uicOf(to);
  const trains = [];
  for (const journey of Array.isArray(answer?.journeys) ? answer.journeys : []) {
    const sections = (journey?.sections ?? []).filter((s) => s?.type === 'public_transport');
    if (sections.length !== 1) {
      continue;
    }
    const [section] = sections;
    const info = section.display_informations ?? {};
    const departure = parseNavitiaDate(section.departure_date_time);
    const arrival = parseNavitiaDate(section.arrival_date_time);
    if (departure === null || arrival === null) {
      continue;
    }
    const baseDeparture = parseNavitiaDate(section.base_departure_date_time) ?? departure;
    const baseArrival = parseNavitiaDate(section.base_arrival_date_time) ?? arrival;
    const number = String(info.headsign || info.trip_short_name || info.name || '').trim();
    const linked = linkedDisruptions(info, byId, disruptions, number, baseDeparture);
    const effects = linked.map((disruption) => disruption?.severity?.effect).filter(Boolean);
    const cancelled =
      effects.includes(EFFECTS.NO_SERVICE) ||
      linked.some(
        (disruption) =>
          deletesStop(disruption, fromUic, 'departure') ||
          deletesStop(disruption, toUic, 'arrival'),
      );
    trains.push({
      id: `${number}@${baseDeparture}`,
      number,
      mode: modeOf(info),
      direction: cleanDirection(info.direction),
      baseDeparture,
      departure,
      baseArrival,
      arrival,
      delay: minutesLate(departure, baseDeparture),
      arrivalDelay: minutesLate(arrival, baseArrival),
      cancelled,
      suspected: false,
      cause: causeOf(linked),
      effect: cancelled ? EFFECTS.NO_SERVICE : (effects[0] ?? String(journey.status || '')),
    });
  }
  return trains.sort((a, b) => a.baseDeparture - b.baseDeparture);
}

/**
 * @description Merge the theoretical and the real-time trains.
 * @param {object[]} base - The trains of the timetable.
 * @param {object[]} realtime - The real-time trains.
 * @returns {object[]} The trains, by theoretical departure.
 * @example
 * mergeTrains(parseJourneys(baseAnswer), parseJourneys(realtimeAnswer));
 */
function mergeTrains(base, realtime) {
  const live = new Map(realtime.map((train) => [train.id, train]));
  const latestLive = realtime.reduce((max, train) => Math.max(max, train.baseDeparture), -Infinity);
  const merged = [];
  base.forEach((train) => {
    const current = live.get(train.id);
    if (current) {
      live.delete(train.id);
      // The real-time page may miss the link of a cancellation the timetable knows.
      merged.push(
        train.cancelled && !current.cancelled
          ? {
              ...current,
              cancelled: true,
              cause: current.cause || train.cause,
              effect: train.effect,
            }
          : { ...current, cause: current.cause || train.cause },
      );
    } else if (train.cancelled) {
      merged.push(train);
    } else if (latestLive > train.baseDeparture) {
      merged.push({ ...train, suspected: true });
    } else {
      merged.push(train);
    }
  });
  merged.push(...live.values());
  return merged.sort((a, b) => a.baseDeparture - b.baseDeparture);
}

/**
 * @description Settle the suspected cancellations with the departures board
 * of the departure station (real time).
 * @param {object[]} trains - The merged trains.
 * @param {object|null} board - The /departures answer, null when it failed.
 * @param {number} [pageSize] - The `count` the board was asked with.
 * @returns {object[]} The trains, no longer suspected: cancelled, late, or
 * left as theoretical when the board cannot tell (never a cancellation on a
 * guess).
 */
function confirmSuspected(trains, board, pageSize = DEPARTURES_COUNT) {
  if (!trains.some((train) => train.suspected)) {
    return trains;
  }
  const departures = Array.isArray(board?.departures) ? board.departures : null;
  const byId = new Map((board?.disruptions ?? []).map((d) => [d?.id, d]));
  const lastDeparture = departures?.length
    ? parseNavitiaDate(departures[departures.length - 1]?.stop_date_time?.departure_date_time)
    : null;
  return trains.map((train) => {
    if (!train.suspected) {
      return train;
    }
    if (departures === null) {
      return { ...train, suspected: false };
    }
    const found = departures.find((departure) => {
      const info = departure?.display_informations ?? {};
      const times = departure?.stop_date_time ?? {};
      return (
        [info.headsign, info.trip_short_name].includes(train.number) &&
        parseNavitiaDate(times.base_departure_date_time) === train.baseDeparture
      );
    });
    if (!found) {
      const conclusive =
        departures.length < pageSize ||
        (lastDeparture !== null && lastDeparture >= train.baseDeparture + CONCLUSIVE_SPAN_MS);
      return conclusive
        ? { ...train, suspected: false, cancelled: true, effect: EFFECTS.NO_SERVICE }
        : { ...train, suspected: false };
    }
    const info = found.display_informations ?? {};
    const linked = linkedDisruptions(info, byId, [], train.number, train.baseDeparture);
    const cause = causeOf(linked) || train.cause;
    if (linked.some((d) => d?.severity?.effect === EFFECTS.NO_SERVICE)) {
      return { ...train, suspected: false, cancelled: true, cause, effect: EFFECTS.NO_SERVICE };
    }
    const departure =
      parseNavitiaDate(found.stop_date_time?.departure_date_time) ?? train.baseDeparture;
    const shift = departure - train.baseDeparture;
    return {
      ...train,
      suspected: false,
      departure,
      arrival: train.baseArrival + shift,
      delay: minutesLate(departure, train.baseDeparture),
      arrivalDelay: minutesLate(train.baseArrival + shift, train.baseArrival),
      cause,
    };
  });
}

/**
 * @description Read the departures of a station board.
 * @param {object} answer - The /departures answer.
 * @returns {object[]} The departures, by real-time departure.
 * @example
 * parseDepartures(answer)[0].direction; // -> 'Nantes'
 */
function parseDepartures(answer) {
  const disruptions = Array.isArray(answer?.disruptions) ? answer.disruptions : [];
  const byId = new Map(disruptions.map((disruption) => [disruption?.id, disruption]));
  const list = [];
  for (const entry of Array.isArray(answer?.departures) ? answer.departures : []) {
    const info = entry?.display_informations ?? {};
    const times = entry?.stop_date_time ?? {};
    const baseDeparture =
      parseNavitiaDate(times.base_departure_date_time) ??
      parseNavitiaDate(times.departure_date_time);
    if (baseDeparture === null) {
      continue;
    }
    const departure = parseNavitiaDate(times.departure_date_time) ?? baseDeparture;
    const number = String(info.headsign || info.trip_short_name || '').trim();
    const linked = linkedDisruptions(info, byId, [], number, baseDeparture);
    list.push({
      id: `${number}@${baseDeparture}`,
      number,
      mode: modeOf(info),
      direction: cleanDirection(info.direction || entry?.route?.direction?.name),
      baseDeparture,
      departure,
      delay: minutesLate(departure, baseDeparture),
      cancelled: linked.some((d) => d?.severity?.effect === EFFECTS.NO_SERVICE),
      cause: causeOf(linked),
    });
  }
  return list.sort((a, b) => a.departure - b.departure);
}

/**
 * @description The state of a train for the user.
 * @param {object} train - The train.
 * @param {number} threshold - Minutes from which a train is "delayed".
 * @returns {'cancelled'|'delayed'|'on_time'} The status.
 * @example
 * trainStatus({ cancelled: false, delay: 7 }, 5); // -> 'delayed'
 */
function trainStatus(train, threshold) {
  if (train.cancelled) {
    return 'cancelled';
  }
  return train.delay >= threshold ? 'delayed' : 'on_time';
}

export {
  EFFECTS,
  DEPARTURES_COUNT,
  plainText,
  uicOf,
  cleanDirection,
  parseJourneys,
  mergeTrains,
  confirmSuspected,
  parseDepartures,
  trainStatus,
};
