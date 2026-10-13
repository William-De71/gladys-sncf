// -----------------------------------------------------------------------------
// Dashboard widgets of the SNCF integration.
//
//   - `trip`   the followed trains of a trip: the next departure (real time)
//              and how long until it leaves, then each train with its times
//              and a badge — on time, +N min, cancelled; a tap on a disrupted
//              train opens the cause. Nudged on every change;
//   - `board`  the departures board of a station, every direction: the
//              station typed in the widget settings, or the departure station
//              of a trip.
//
// Each `trip` widget picks a trip among the devices of the integration
// (`source: "devices"`); empty = the first trip.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, trainLabel, localeOf } from './i18n.js';
import { trainStatus } from './trains.js';
import { formatTime, parisDate } from './time.js';

const WIDGETS = {
  TRIP: 'trip',
  BOARD: 'board',
};

const TTL_SECONDS = {
  busy: 60,
  idle: 300,
  board: 120,
  message: 300,
};

const BOARD_COUNT = { min: 1, max: 8, default: 6 };
const MAX_LIST_ITEMS = 8;
// "Leaves in 600 min" says nothing: past 3 hours, the departure time is enough.
const MAX_LEFT_MINUTES = 180;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('Paris Montparnasse Hall 1 & 2', 12); // -> 'Paris Montp…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('No trip');
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description The badge of a train.
 * @param {object} train - The train.
 * @param {number} threshold - The delay threshold (minutes).
 * @param {string} language - The language.
 * @returns {{ text: string, color: string }} The badge.
 */
function badgeOf(train, threshold, language) {
  if (train.cancelled) {
    return { text: t('badgeCancelled', language), color: WIDGET_COLORS.DANGER };
  }
  if (train.delay <= 0) {
    return { text: t('badgeOnTime', language), color: WIDGET_COLORS.SUCCESS };
  }
  let color = WIDGET_COLORS.NEUTRAL;
  if (train.delay >= 30) {
    color = WIDGET_COLORS.DANGER;
  } else if (train.delay >= threshold) {
    color = WIDGET_COLORS.WARNING;
  }
  return { text: t('late', language, { n: train.delay }), color };
}

/**
 * @description The color of a train state.
 * @param {object} train - The train.
 * @param {number} threshold - The delay threshold (minutes).
 * @returns {string} The color.
 */
function colorOf(train, threshold) {
  const status = trainStatus(train, threshold);
  if (status === 'cancelled') {
    return WIDGET_COLORS.DANGER;
  }
  return status === 'delayed' ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

/**
 * @description The "trip" widget.
 * @param {object} options - Options.
 * @param {object} options.trip - The resolved trip.
 * @param {object} options.snapshot - `{ trains, span, readAt }`.
 * @param {number} options.threshold - The delay threshold (minutes).
 * @param {boolean} options.busy - Whether the trip is in its busy period.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 * @example
 * buildTripWidget({ trip, snapshot, threshold: 5, busy: true, language: 'fr', now: Date.now() });
 */
function buildTripWidget({ trip, snapshot, threshold, busy, language, now }) {
  const ttl = busy ? TTL_SECONDS.busy : TTL_SECONDS.idle;
  const { trains } = snapshot;
  const components = [{ type: 'text', variant: 'heading', text: clip(trip.name, 40) }];
  const day = snapshot.span?.date;
  if (day && day !== parisDate(now)) {
    const label = new Intl.DateTimeFormat(localeOf(language), {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${day}T12:00:00Z`));
    components.push({
      type: 'text',
      variant: 'caption',
      text: clip(t('tripDay', language, { day: label }), 80),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'caption',
      text: t('updatedAt', language, { time: formatTime(snapshot.readAt) }),
    });
  }
  if (trains.length === 0) {
    // Two texts at most: the message replaces the caption.
    return {
      ttl_seconds: ttl,
      components: [
        components[0],
        { type: 'text', variant: 'body', text: t('noTrainWidget', language) },
      ],
    };
  }
  const next = trains.find((train) => !train.cancelled);
  if (next) {
    components.push({
      type: 'value',
      value: formatTime(next.departure),
      label: t('nextTrain', language),
      icon: 'clock',
      color: colorOf(next, threshold),
    });
    const left = Math.round((next.departure - now) / 60000);
    if (left >= 0 && left < MAX_LEFT_MINUTES) {
      components.push({
        type: 'value',
        value: left,
        unit: t('minutesShort', language),
        label: t('departsIn', language),
        icon: 'navigation',
      });
    }
  }
  components.push({
    type: 'card-list',
    display: 'list',
    items: trains.slice(0, MAX_LIST_ITEMS).map((train) => {
      const late = !train.cancelled && train.delay > 0;
      const item = {
        title: clip(`${formatTime(train.departure)} → ${formatTime(train.arrival)}`, 60),
        subtitle: clip(
          late
            ? `${trainLabel(train)} · ${formatTime(train.baseDeparture)} → ${formatTime(train.baseArrival)}`
            : [
                trainLabel(train),
                train.direction && t('towards', language, { direction: train.direction }),
              ]
                .filter(Boolean)
                .join(' · '),
          60,
        ),
        badge: badgeOf(train, threshold, language),
      };
      if (train.cause) {
        item.description = clip(train.cause, 2000);
      }
      return item;
    }),
  });
  return { ttl_seconds: ttl, components };
}

/**
 * @description The "board" widget.
 * @param {object} options - Options.
 * @param {{ name: string }} options.station - The station.
 * @param {object[]} options.departures - Its departures (parseDepartures).
 * @param {number} options.count - How many to show.
 * @param {number} options.threshold - The delay threshold (minutes).
 * @param {string} options.language - The user language.
 * @returns {object} The content.
 * @example
 * buildBoardWidget({ station, departures, count: 6, threshold: 5, language: 'fr' });
 */
function buildBoardWidget({ station, departures, count, threshold, language }) {
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: clip(t('boardOf', language, { station: station.name }), 40),
    },
  ];
  if (departures.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t('noDeparture', language) });
    return { ttl_seconds: TTL_SECONDS.board, components };
  }
  components.push({
    type: 'card-list',
    display: 'list',
    items: departures.slice(0, Math.min(count, MAX_LIST_ITEMS)).map((departure) => {
      const item = {
        title: clip(`${formatTime(departure.baseDeparture)} ${departure.direction}`.trim(), 60),
        subtitle: clip(trainLabel(departure), 60),
        badge: badgeOf(departure, threshold, language),
      };
      if (departure.cause) {
        item.description = clip(departure.cause, 2000);
      }
      return item;
    }),
  });
  return { ttl_seconds: TTL_SECONDS.board, components };
}

export {
  WIDGETS,
  TTL_SECONDS,
  BOARD_COUNT,
  messageContent,
  readCount,
  buildTripWidget,
  buildBoardWidget,
};
