// -----------------------------------------------------------------------------
// Dates of the SNCF API.
//
// The API (Navitia) speaks the local time of its coverage, France, with no
// offset: "20261011T074200" is 07:42 in Paris, whatever the time zone of the
// Gladys machine. These helpers turn them into instants (ms) and back, through
// the Europe/Paris rules of Intl (summer time included), never through the
// time zone of the process.
// -----------------------------------------------------------------------------

const ZONE = 'Europe/Paris';
const NAVITIA_DATE_REGEX = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * @description The Paris wall clock of an instant.
 * @param {number} ms - The instant.
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }} The parts.
 * @example
 * parisParts(Date.parse('2026-10-11T05:42:00Z')).hour; // -> 7
 */
function parisParts(ms) {
  const parts = {};
  partsFormatter.formatToParts(new Date(ms)).forEach(({ type, value }) => {
    if (type !== 'literal') {
      parts[type] = Number(value);
    }
  });
  return parts;
}

/**
 * @description The offset of Paris from UTC at an instant, in ms.
 * @param {number} ms - The instant.
 * @returns {number} The offset (3600000 in winter, 7200000 in summer).
 */
function parisOffset(ms) {
  const p = parisParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * @description Parse a date of the API.
 * @param {unknown} value - "YYYYMMDDTHHMMSS", Paris time.
 * @returns {number|null} The instant in ms, null when not a date.
 * @example
 * parseNavitiaDate('20261011T074200'); // -> Date.parse('2026-10-11T05:42:00Z')
 */
function parseNavitiaDate(value) {
  const match = NAVITIA_DATE_REGEX.exec(String(value ?? ''));
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(wall)) {
    return null;
  }
  // The offset of the wall time itself, corrected once around a change.
  let ms = wall - parisOffset(wall);
  ms = wall - parisOffset(ms);
  return ms;
}

/**
 * @description Format an instant as a date of the API.
 * @param {number} ms - The instant.
 * @returns {string} "YYYYMMDDTHHMMSS", Paris time.
 * @example
 * toNavitiaDate(Date.parse('2026-10-11T05:42:00Z')); // -> '20261011T074200'
 */
function toNavitiaDate(ms) {
  const p = parisParts(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

/**
 * @description The Paris time of an instant, "HH:MM".
 * @param {number} ms - The instant.
 * @returns {string} The time.
 * @example
 * formatTime(Date.parse('2026-10-11T05:42:00Z')); // -> '07:42'
 */
function formatTime(ms) {
  const p = parisParts(ms);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/**
 * @description The minutes since midnight, Paris time.
 * @param {number} ms - The instant.
 * @returns {number} The minutes (0-1439).
 * @example
 * minutesOfDay(Date.parse('2026-10-11T05:42:00Z')); // -> 462
 */
function minutesOfDay(ms) {
  const p = parisParts(ms);
  return p.hour * 60 + p.minute;
}

/**
 * @description The day of the week, Paris time.
 * @param {number} ms - The instant.
 * @returns {number} 1 (Monday) to 7 (Sunday).
 * @example
 * isoWeekday(Date.parse('2026-10-11T05:42:00Z')); // -> 7
 */
function isoWeekday(ms) {
  const p = parisParts(ms);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * @description The ISO date of an instant in Paris, "YYYY-MM-DD".
 * @param {number} ms - The instant.
 * @returns {string} The date.
 * @example
 * parisDate(Date.parse('2026-10-11T22:30:00Z')); // -> '2026-10-12'
 */
function parisDate(ms) {
  const p = parisParts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export { ZONE, parseNavitiaDate, toNavitiaDate, formatTime, minutesOfDay, isoWeekday, parisDate };
