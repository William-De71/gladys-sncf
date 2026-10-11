// -----------------------------------------------------------------------------
// Configuration of the SNCF integration.
//
// Fields of the config_schema:
//   - `api_key`                 the SNCF API key (free, numerique.sncf.com);
//   - `trip_<n>_from` / `_to`   the stations of trip n (1 to 3): a name
//                               ("Rennes"), a UIC code ("87471003") or a
//                               Navitia id ("stop_area:SNCF:87471003");
//   - `trip_<n>_hours`          optional travel window, "07:00-09:30": the
//                               trains of that window are followed, and read
//                               often only around it (the API quota);
//   - `trip_<n>_days`           optional travel days (empty = every day);
//   - `train_count`             how many trains are followed per trip;
//   - `delay_threshold`         from how many minutes a train is "delayed";
//   - `poll_interval`           minutes between two reads around the window;
//   - `idle_interval`           minutes between two reads the rest of the time.
//
// Internal keys, outside the config_schema (never shown in the UI):
//   - `last_language`   language of the last widget request, for the device
//                       names and the scene texts after a restart.
// -----------------------------------------------------------------------------

const MAX_TRIPS = 3;
const TRAIN_COUNT = { min: 1, max: 8, default: 4 };
const DELAY_THRESHOLD = { min: 1, max: 30, default: 5 };
const POLL_INTERVAL = { min: 2, max: 30, default: 3 };
const IDLE_INTERVAL = { min: 10, max: 180, default: 30 };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// SNCF API keys are UUIDs; anything shorter cannot be one.
const API_KEY_REGEX = /^[A-Za-z0-9-]{20,64}$/;
const HOURS_REGEX = /^(\d{1,2})[:hH](\d{2})?\s*[-–à>]+\s*(\d{1,2})[:hH](\d{2})?$/;

const INTERNAL_KEYS = {
  language: 'last_language',
};

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('10', POLL_INTERVAL); // -> 10
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || raw === null || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description Read a trimmed string.
 * @param {unknown} raw - The raw value.
 * @returns {string} The string, '' when absent.
 * @example
 * readString(' Rennes '); // -> 'Rennes'
 */
function readString(raw) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

/**
 * @description Parse a travel window.
 * @param {unknown} raw - "07:00-09:30", "7h-9h30", "06:45 à 08:00".
 * @returns {{ start: number, end: number }|null} Minutes since midnight
 * (end after start, a window crossing midnight ends at 24:00), null when
 * absent or invalid.
 * @example
 * parseHours('7h-9h30'); // -> { start: 420, end: 570 }
 */
function parseHours(raw) {
  const match = HOURS_REGEX.exec(readString(raw));
  if (!match) {
    return null;
  }
  const [startHour, startMinute, endHour, endMinute] = match.slice(1).map((v) => Number(v ?? 0));
  if (startHour > 23 || endHour > 24 || startMinute > 59 || endMinute > 59) {
    return null;
  }
  const start = startHour * 60 + startMinute;
  let end = Math.min(24 * 60, endHour * 60 + endMinute);
  if (end <= start) {
    end = 24 * 60;
  }
  return { start, end };
}

/**
 * @description Parse the travel days.
 * @param {unknown} raw - The multi_select value (an array, or a comma list).
 * @returns {number[]} ISO weekdays (1 = Monday), every day when empty.
 * @example
 * parseDays(['mon', 'fri']); // -> [1, 5]
 */
function parseDays(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      list = raw.split(/[\s,;]+/);
    }
  }
  const days = [...new Set(list.map((day) => DAYS.indexOf(String(day)) + 1).filter((d) => d > 0))];
  return days.length === 0 ? [1, 2, 3, 4, 5, 6, 7] : days.sort((a, b) => a - b);
}

/**
 * @description Read the trips of the form: a trip needs both stations.
 * @param {object} config - The raw config.
 * @returns {Array<{ slot: number, from: string, to: string, hours: object|null, days: number[] }>} The trips.
 */
function readTrips(config) {
  const trips = [];
  for (let slot = 1; slot <= MAX_TRIPS; slot += 1) {
    const from = readString(config[`trip_${slot}_from`]);
    const to = readString(config[`trip_${slot}_to`]);
    if (from && to) {
      trips.push({
        slot,
        from,
        to,
        hours: parseHours(config[`trip_${slot}_hours`]),
        days: parseDays(config[`trip_${slot}_days`]),
      });
    }
  }
  return trips;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ apiKey: string, trips: Array, trainCount: number,
 * delayThreshold: number, pollInterval: number, idleInterval: number }} The
 * config (intervals in minutes).
 * @example
 * normalizeConfig({ api_key: '…', trip_1_from: 'Rennes', trip_1_to: 'Nantes' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const apiKey = readString(config.api_key);
  return {
    apiKey: API_KEY_REGEX.test(apiKey) ? apiKey : '',
    trips: readTrips(config),
    trainCount: readNumber(config.train_count, TRAIN_COUNT),
    delayThreshold: readNumber(config.delay_threshold, DELAY_THRESHOLD),
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    idleInterval: readNumber(config.idle_interval, IDLE_INTERVAL),
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_TRIPS,
  TRAIN_COUNT,
  DELAY_THRESHOLD,
  POLL_INTERVAL,
  IDLE_INTERVAL,
  DAYS,
  INTERNAL_KEYS,
  normalizeConfig,
  parseHours,
  parseDays,
  readLanguage,
};
