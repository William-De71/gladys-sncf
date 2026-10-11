// -----------------------------------------------------------------------------
// When the trains of a trip are read, and which ones.
//
// A trip may have a travel window ("07:00-09:30") and travel days. Then:
//   - the trains followed are the ones of the NEXT window: today's while it
//     is not over, the next travel day's afterwards — at 22:00 the widget
//     already shows tomorrow morning's trains, and a cancellation announced
//     the evening before fires its scene the evening before;
//   - the trip is read every `poll_interval` minutes from an hour before the
//     window to its end, every `idle_interval` minutes the rest of the time.
// Without a window: the next trains from now, read every `poll_interval`
// minutes, except at night (00:30-04:30, no train runs) where the idle
// interval applies.
//
// Every time is the time of Paris (the time of the timetables).
// -----------------------------------------------------------------------------

import { isoWeekday, minutesOfDay, parisDate, parseNavitiaDate } from './time.js';

const LEAD_MINUTES = 60;
// Trains are asked from a little in the past: a train due 20 minutes ago but
// 25 minutes late has not left yet.
const LOOKBACK_MS = 45 * 60 * 1000;
const NIGHT = { start: 30, end: 270 };
const DAY_MS = 24 * 3600 * 1000;

/**
 * @description The instant of a time of a Paris day.
 * @param {string} date - "YYYY-MM-DD".
 * @param {number} minutes - Minutes since midnight (1440 = the next midnight).
 * @returns {number} The instant (ms).
 * @example
 * atParisTime('2026-10-12', 420); // -> Date.parse('2026-10-12T05:00:00Z')
 */
function atParisTime(date, minutes) {
  const day = Math.floor(minutes / 1440);
  const rest = minutes - day * 1440;
  const base = parseNavitiaDate(
    `${date.replace(/-/g, '')}T${String(Math.floor(rest / 60)).padStart(2, '0')}${String(rest % 60).padStart(2, '0')}00`,
  );
  return base + day * DAY_MS;
}

/**
 * @description Whether a trip is in its busy period (read often).
 * @param {object} trip - The trip (`hours`, `days`).
 * @param {number} now - Now (ms).
 * @returns {boolean} True around the travel window.
 * @example
 * isBusy({ hours: { start: 420, end: 570 }, days: [1, 2, 3, 4, 5] }, now);
 */
function isBusy(trip, now) {
  const minute = minutesOfDay(now);
  if (!trip.hours) {
    return minute < NIGHT.start || minute >= NIGHT.end;
  }
  if (!trip.days.includes(isoWeekday(now))) {
    return false;
  }
  return minute >= trip.hours.start - LEAD_MINUTES && minute < trip.hours.end;
}

/**
 * @description The span of trains to follow.
 * @param {object} trip - The trip (`hours`, `days`).
 * @param {number} now - Now (ms).
 * @returns {{ from: number, until: number|null, date: string|null }} Ask the
 * trains from `from`; keep the ones leaving before `until` (null: no bound);
 * `date` is the travel day of a window.
 * @example
 * followedSpan(trip, Date.now());
 */
function followedSpan(trip, now) {
  if (!trip.hours) {
    return { from: now - LOOKBACK_MS, until: null, date: null };
  }
  for (let offset = 0; offset <= 7; offset += 1) {
    const instant = now + offset * DAY_MS;
    const date = parisDate(instant);
    if (!trip.days.includes(isoWeekday(instant))) {
      continue;
    }
    const start = atParisTime(date, trip.hours.start);
    const end = atParisTime(date, trip.hours.end);
    if (now < end) {
      return { from: Math.max(start, now - LOOKBACK_MS), until: end, date };
    }
  }
  return { from: now - LOOKBACK_MS, until: null, date: null };
}

/**
 * @description Keep the trains still to come, in the span.
 * @param {object[]} trains - The trains.
 * @param {object} span - The followed span.
 * @param {number} now - Now (ms).
 * @param {number} count - How many to keep.
 * @returns {object[]} The trains.
 * @example
 * upcoming(trains, span, Date.now(), 4);
 */
function upcoming(trains, span, now, count) {
  return trains
    .filter((train) => (train.cancelled ? train.baseDeparture : train.departure) > now - 60000)
    .filter((train) => span.until === null || train.baseDeparture < span.until)
    .slice(0, count);
}

/**
 * @description Milliseconds until the next read of a trip.
 * @param {object} trip - The trip.
 * @param {number} now - Now (ms).
 * @param {{ pollInterval: number, idleInterval: number }} config - Intervals, in minutes.
 * @returns {number} The delay (ms): never past the start of the busy period.
 * @example
 * nextDelay(trip, Date.now(), { pollInterval: 3, idleInterval: 30 });
 */
function nextDelay(trip, now, { pollInterval, idleInterval }) {
  const busy = pollInterval * 60000;
  if (isBusy(trip, now)) {
    return busy;
  }
  // Idle: wake up early enough not to miss the start of the busy period.
  const idle = idleInterval * 60000;
  for (let step = busy; step < idle; step += busy) {
    if (isBusy(trip, now + step)) {
      return step;
    }
  }
  return idle;
}

export { LEAD_MINUTES, atParisTime, isBusy, followedSpan, upcoming, nextDelay };
