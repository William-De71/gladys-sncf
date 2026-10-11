// -----------------------------------------------------------------------------
// Entry point of the SNCF external integration.
//
// Follows the trains of up to three trips (home → work, work → home…) on the
// SNCF network — TER, TGV INOUI, OUIGO, Intercités… — in real time, through
// the official SNCF API (a free key, 5 000 requests a day):
//   - a device per trip (Discovery screen): the next train, its delay, how
//     many followed trains are disrupted (see device.js);
//   - scene triggers: a train delayed, a train cancelled, the next train
//     leaving in N minutes — real-time departure (see tracker.js, events.js);
//   - a scene action: the next trains of a trip, as values and as a sentence
//     (see scene-actions.js);
//   - dashboard widgets: the trains of a trip, the departures board of a
//     station (see widgets.js).
//
// The SNCF API has no push: each trip is read on its own timer, often around
// its travel window, rarely the rest of the day (see schedule.js, watcher.js),
// and the requests are counted against the daily quota (see quota.js).
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS } from './src/config.js';
import { createSncfClient, buildUserAgent } from './src/sncf-api.js';
import { createStore } from './src/store.js';
import { createQuota } from './src/quota.js';
import { createStations } from './src/stations.js';
import { createWatcher } from './src/watcher.js';
import { createTracker } from './src/tracker.js';
import { buildDevice, buildStates, idsOf, tripFromExternalId, tripKey } from './src/device.js';
import { buildSceneEvent } from './src/events.js';
import { parseDepartures } from './src/trains.js';
import { isBusy } from './src/schedule.js';
import { formatTime, toNavitiaDate } from './src/time.js';
import { t, all } from './src/i18n.js';
import { SCENE_ACTIONS, buildNextTrainsOutputs } from './src/scene-actions.js';
import {
  WIDGETS,
  BOARD_COUNT,
  messageContent,
  readCount,
  buildTripWidget,
  buildBoardWidget,
} from './src/widgets.js';

const { name, version, homepage } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);

const ACTIONS = { TEST_CONNECTION: 'test_connection', SEARCH_STATION: 'search_station' };
// A widget or a scene action reuses the last read of a trip while it is this fresh.
const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 1000;
const BOARD_MAX_AGE_MS = 90 * 1000;
const REMINDER_TICK_MS = 30 * 1000;
// Stations that failed for a network reason are resolved again this often.
const RESOLVE_RETRY_MS = 5 * 60 * 1000;

const gladys = new GladysIntegration();

let config = normalizeConfig();
// Language of the last widget request: names of the devices, scene summaries.
let language = 'fr';
// Device external ids the user created (states are only published for them).
let createdDevices = new Set();
// Last connection status sent, to send it again only when it changes.
let lastStatus = null;
// The configured trips whose stations are known.
let trips = [];
// What the user typed and the SNCF does not know.
let unknownStations = [];
let resolveTimer = null;
let reminderTimer = null;
// station id -> { at, departures }
const boards = new Map();

const quota = createQuota({ store: createStore('quota.json', { logger }) });
const sncf = createSncfClient({
  getApiKey: () => config.apiKey,
  getUserAgent: () => buildUserAgent({ name, version, homepage }),
  onRequest: () => quota.record(),
});
const stations = createStations({ sncf, store: createStore('stations.json', { logger }) });
const tracker = createTracker({ store: createStore('fired.json', { logger }) });

/**
 * @description Remember the language of a request, and store it when it changed.
 * @param {string} next - The language.
 * @example
 * rememberLanguage('fr');
 */
function rememberLanguage(next) {
  if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
    return;
  }
  language = next;
  gladys
    .setConfig({ [INTERNAL_KEYS.language]: next })
    .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
}

/**
 * @description Report the connection status, only when it changed.
 * @param {boolean} connected - Connected or not.
 * @param {object} message - The multi-language message.
 * @returns {Promise<void>}
 */
async function reportStatus(connected, message) {
  const signature = JSON.stringify([connected, message]);
  if (signature === lastStatus) {
    return;
  }
  lastStatus = signature;
  try {
    await gladys.setConnectionStatus(connected, message);
  } catch (err) {
    lastStatus = null;
    logger.error('Unable to report the connection status', err);
  }
}

/**
 * @description Work out the connection status from the last reads.
 * @param {Error|null} [checkError] - The error of a key check, when no trip is read.
 * @returns {Promise<void>}
 */
async function refreshStatus(checkError = null) {
  if (!config.apiKey) {
    await reportStatus(false, all('noApiKey'));
    return;
  }
  const blockedUntil = quota.blockedUntil();
  if (blockedUntil) {
    await reportStatus(false, all('statusQuota', { time: formatTime(blockedUntil) }));
    return;
  }
  const errors = watcher
    .errors()
    .map((entry) => entry.error)
    .concat(checkError ? [checkError] : [])
    .filter(Boolean);
  if (errors.some((err) => err.isAuth)) {
    await reportStatus(false, all('statusInvalidKey'));
    return;
  }
  if (unknownStations.length > 0) {
    await reportStatus(false, all('statusBadStation', { names: unknownStations.join(', ') }));
    return;
  }
  if (errors.length > 0 && errors.length >= Math.max(1, trips.length)) {
    if (errors.every((err) => err.budget)) {
      await reportStatus(true, all('statusBudget', { used: quota.used() }));
      return;
    }
    await reportStatus(false, all('statusUnreachable'));
    return;
  }
  if (trips.length === 0) {
    await reportStatus(true, all('statusNoTrip'));
    return;
  }
  await reportStatus(true, all('statusOk', { trips: trips.length, used: quota.used() }));
}

/**
 * @description Refresh the list of the devices the user created.
 * @returns {Promise<void>}
 */
async function refreshCreatedDevices() {
  try {
    const devices = await gladys.getDevices();
    createdDevices = new Set(devices.map((device) => device.external_id));
  } catch (err) {
    logger.warn(`Unable to read the devices: ${err.message}`);
  }
}

/**
 * @description Publish the states of a trip, when its device exists.
 * @param {object} trip - The resolved trip.
 * @param {object} snapshot - Its last read.
 * @returns {Promise<void>}
 */
async function publishStates(trip, snapshot) {
  if (!createdDevices.has(idsOf(gladys, trip).device)) {
    return;
  }
  await gladys.publishStates(
    buildStates(gladys, trip, snapshot.trains, { threshold: config.delayThreshold, language }),
  );
}

/**
 * @description Publish scene events, one by one.
 * @param {object} trip - The resolved trip.
 * @param {object[]} events - The tracker events.
 * @returns {Promise<void>}
 */
async function publishEvents(trip, events) {
  for (const event of events) {
    const { key, data } = buildSceneEvent(gladys, trip, event, language);
    logger.info(`${trip.name}: ${key} (${data.train_number} ${data.scheduled_departure})`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }
}

// --- The reads of the trips --------------------------------------------------------
const watcher = createWatcher({
  sncf,
  quota,
  getTrips: () => (config.apiKey ? trips : []),
  getSettings: () => config,
  onRead: async (trip, snapshot, { changed }) => {
    await publishEvents(trip, tracker.diff(trip.key, snapshot.trains, config.delayThreshold));
    await publishEvents(trip, tracker.reminders(trip.key, snapshot.trains, Date.now()));
    await tracker.persist(Date.now());
    if (changed) {
      await publishStates(trip, snapshot).catch((err) =>
        logger.warn(`Unable to publish the states of ${trip.name}: ${err.message}`),
      );
      gladys.requestWidgetRefresh(WIDGETS.TRIP);
    }
    await refreshStatus();
  },
  onError: async () => {
    await refreshStatus();
  },
  logger,
});

/**
 * @description Check the departure reminders on the last reads.
 * @returns {Promise<void>}
 */
async function checkReminders() {
  // Disconnected, the event would be lost while marked as fired.
  if (!gladys.connected) {
    return;
  }
  const now = Date.now();
  for (const trip of trips) {
    const snapshot = watcher.peek(trip.key);
    if (snapshot) {
      await publishEvents(trip, tracker.reminders(trip.key, snapshot.trains, now));
    }
  }
  await tracker.persist(now);
}

// --- Trips -------------------------------------------------------------------------

/**
 * @description Resolve the stations of the configured trips.
 * @returns {Promise<void>}
 */
async function resolveTrips() {
  clearTimeout(resolveTimer);
  const resolved = [];
  const unknown = [];
  let retry = false;
  if (config.apiKey) {
    for (const entry of config.trips) {
      try {
        const [from, to] = [await stations.resolve(entry.from), await stations.resolve(entry.to)];
        if (!from) {
          unknown.push(entry.from);
        }
        if (!to) {
          unknown.push(entry.to);
        }
        if (from && to && from.id !== to.id) {
          const key = tripKey(from, to);
          if (!resolved.some((trip) => trip.key === key)) {
            resolved.push({ ...entry, from, to, key, name: `${from.name} → ${to.name}` });
          }
        }
      } catch (err) {
        logger.warn(`Unable to resolve the stations of trip ${entry.slot}: ${err.message}`);
        retry = !err.isAuth;
        // Keep the trip when its stations were resolved before.
        const [from, to] = [stations.peek(entry.from), stations.peek(entry.to)];
        if (from && to) {
          resolved.push({
            ...entry,
            from,
            to,
            key: tripKey(from, to),
            name: `${from.name} → ${to.name}`,
          });
        }
      }
    }
  }
  trips = resolved;
  unknownStations = unknown;
  if (retry) {
    resolveTimer = setTimeout(() => {
      resolveTrips()
        .then(() => watcher.reschedule())
        .catch(() => {});
    }, RESOLVE_RETRY_MS);
    resolveTimer.unref?.();
  }
}

/**
 * @description The trip a widget or a scene action targets.
 * @param {unknown} deviceExternalId - The `source: "devices"` value.
 * @returns {object|null} The trip, the first one by default.
 */
function resolveTrip(deviceExternalId) {
  return tripFromExternalId(deviceExternalId, trips) ?? trips[0] ?? null;
}

/**
 * @description Offer a device per resolved trip on the Discovery screen.
 * @returns {Promise<number>} How many devices were offered.
 */
async function publishDiscoveredDevices() {
  await gladys.publishDiscoveredDevices(trips.map((trip) => buildDevice(gladys, trip, language)));
  return trips.length;
}

// --- Dashboard widgets -------------------------------------------------------------

/**
 * @description The message of a failed read, for a widget.
 * @param {Error} err - The error.
 * @param {string} lang - The language.
 * @returns {string} The message.
 */
function readErrorMessage(err, lang) {
  if (err.isAuth) {
    return t('statusInvalidKey', lang);
  }
  if (err.isQuota) {
    return t('statusQuota', lang, { time: formatTime(quota.blockedUntil() || Date.now()) });
  }
  return t('unavailable', lang);
}

gladys.onWidgetGet(WIDGETS.TRIP, async ({ settings = {}, language: lang }) => {
  rememberLanguage(lang);
  if (!config.apiKey) {
    return messageContent(t('noApiKey', lang));
  }
  const trip = resolveTrip(settings.trip);
  if (!trip) {
    return messageContent(t('noTrip', lang));
  }
  try {
    const snapshot = await watcher.get(trip, SNAPSHOT_MAX_AGE_MS);
    const now = Date.now();
    return buildTripWidget({
      trip,
      snapshot,
      threshold: config.delayThreshold,
      busy: isBusy(trip, now),
      language: lang,
      now,
    });
  } catch (err) {
    logger.warn(`Widget: unable to read ${trip.name}: ${err.message}`);
    return messageContent(readErrorMessage(err, lang), 60);
  }
});

gladys.onWidgetGet(WIDGETS.BOARD, async ({ settings = {}, language: lang }) => {
  rememberLanguage(lang);
  if (!config.apiKey) {
    return messageContent(t('noApiKey', lang));
  }
  let station;
  const typed = typeof settings.station === 'string' ? settings.station.trim() : '';
  try {
    if (typed) {
      station = await stations.resolve(typed);
      if (!station) {
        return messageContent(t('unknownStation', lang, { name: typed.slice(0, 60) }));
      }
    } else {
      station = resolveTrip(settings.trip)?.from ?? null;
    }
    if (!station) {
      return messageContent(t('noStation', lang));
    }
    let board = boards.get(station.id);
    const stale = !board || Date.now() - board.at > BOARD_MAX_AGE_MS;
    // Out of quota, an old board is better than nothing.
    if (stale && (quota.canRequest() || !board)) {
      const answer = await sncf.departures({
        stopArea: station.id,
        fromDatetime: toNavitiaDate(Date.now()),
        count: BOARD_COUNT.max + 4,
      });
      board = { at: Date.now(), departures: parseDepartures(answer) };
      boards.set(station.id, board);
    }
    const now = Date.now();
    return buildBoardWidget({
      station,
      departures: board.departures.filter((d) => d.departure > now - 60000),
      count: readCount(settings.count, BOARD_COUNT),
      threshold: config.delayThreshold,
      language: lang,
    });
  } catch (err) {
    if (err.isQuota) {
      quota.block(err.retryAfter);
    }
    logger.warn(`Widget: unable to read the departures board: ${err.message}`);
    return messageContent(readErrorMessage(err, lang), 60);
  }
});

// --- Scene actions -----------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.GET_NEXT_TRAINS, async (fields) => {
  const trip = resolveTrip(fields.trip);
  if (!trip) {
    throw new Error('No SNCF trip is configured');
  }
  const snapshot = await watcher.get(trip, SNAPSHOT_MAX_AGE_MS);
  return buildNextTrainsOutputs({
    trip,
    trains: snapshot.trains,
    threshold: config.delayThreshold,
    now: Date.now(),
    language,
  });
});

// --- Configuration screen actions --------------------------------------------------
gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
  if (!config.apiKey) {
    return all('noApiKey');
  }
  await resolveTrips();
  if (trips.length === 0 && unknownStations.length === 0) {
    await sncf.searchStations('Paris', 1);
    await refreshStatus();
    return all('statusNoTrip');
  }
  const lines = { en: [], fr: [] };
  for (const trip of trips) {
    try {
      const snapshot = await watcher.get(trip, 0);
      const first = snapshot.trains[0];
      const next = first ? formatTime(first.baseDeparture) : '–';
      lines.en.push(`${trip.name}: OK, ${snapshot.trains.length} train(s), next ${next}`);
      lines.fr.push(`${trip.name} : OK, ${snapshot.trains.length} train(s), prochain ${next}`);
    } catch (err) {
      lines.en.push(`${trip.name}: ${readErrorMessage(err, 'en')}`);
      lines.fr.push(`${trip.name} : ${readErrorMessage(err, 'fr')}`);
    }
  }
  unknownStations.forEach((station) => {
    lines.en.push(`"${station}": station not found`);
    lines.fr.push(`« ${station} » : gare introuvable`);
  });
  lines.en.push(`${quota.used()} requests in 24 h`);
  lines.fr.push(`${quota.used()} requêtes en 24 h`);
  await refreshStatus();
  return { en: lines.en.join(' · '), fr: lines.fr.join(' · ') };
});

gladys.onAction(ACTIONS.SEARCH_STATION, async (fields) => {
  const query = typeof fields.query === 'string' ? fields.query.trim() : '';
  if (query.length < 2) {
    return {
      en: 'Type at least 2 characters of the station name.',
      fr: 'Saisissez au moins 2 caractères du nom de la gare.',
    };
  }
  if (!config.apiKey) {
    return all('noApiKey');
  }
  const found = await sncf.searchStations(query, 6);
  if (found.length === 0) {
    return {
      en: `No station matches "${query}".`,
      fr: `Aucune gare ne correspond à « ${query} ».`,
    };
  }
  const list = found
    .map((station) => `${station.label || station.name} = ${station.id}`)
    .join(' · ');
  return {
    en: `${list}. Copy the identifier of the right station into a trip field.`,
    fr: `${list}. Copiez l’identifiant de la bonne gare dans un champ de trajet.`,
  };
});

// --- Devices -----------------------------------------------------------------------
gladys.onScanRequest(async () => {
  const count = await publishDiscoveredDevices();
  logger.info(`Scan: ${count} SNCF trip(s) offered`);
});

gladys.onDeviceCreated(async (device) => {
  await refreshCreatedDevices();
  const trip = tripFromExternalId(device.external_id, trips);
  const snapshot = trip ? watcher.peek(trip.key) : null;
  if (snapshot) {
    await publishStates(trip, snapshot).catch((err) =>
      logger.warn(`Unable to publish the states of ${trip.name}: ${err.message}`),
    );
  }
});

gladys.onDeviceDeleted(refreshCreatedDevices);

// --- Configuration -----------------------------------------------------------------

/**
 * @description Reload the whole config (internal keys included).
 * @param {object} [fallback] - Raw values to use when the read fails.
 * @returns {Promise<void>}
 */
async function loadConfig(fallback) {
  try {
    const raw = await gladys.getConfig();
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
  } catch (err) {
    if (fallback) {
      config = normalizeConfig(fallback);
    }
    logger.error('Unable to read the configuration', err);
  }
}

/**
 * @description Apply the configuration: stations, devices, reads, status.
 * @returns {Promise<void>}
 */
async function applyConfig() {
  await resolveTrips();
  logger.info(
    `${trips.length} trip(s): ${trips.map((trip) => trip.name).join(', ') || 'none'}; ${quota.used()} requests in the last 24 h`,
  );
  await publishDiscoveredDevices().catch((err) =>
    logger.warn(`Unable to offer the devices: ${err.message}`),
  );
  watcher.reschedule();
  let checkError = null;
  if (config.apiKey && trips.length === 0 && unknownStations.length === 0) {
    // No trip to prove the key: one search does.
    checkError = await sncf.searchStations('Paris', 1).then(
      () => null,
      (err) => err,
    );
  }
  await refreshStatus(checkError);
}

gladys.onConfigUpdated(async (rawConfig) => {
  await loadConfig(rawConfig);
  boards.clear();
  await applyConfig();
});

// --- Connection lifecycle ----------------------------------------------------------
// Each step on its own: a failing one must not keep the watcher from starting.
gladys.on('connected', async () => {
  await loadConfig();
  await refreshCreatedDevices();
  lastStatus = null;
  watcher.start();
  await applyConfig();
});

// --- Graceful shutdown -------------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  watcher.stop();
  clearTimeout(resolveTimer);
  clearInterval(reminderTimer);
  await quota.flush();
  await tracker.persist(Date.now());
});

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the SNCF integration ${version}...`);
await quota.load();
await tracker.load();
reminderTimer = setInterval(() => {
  checkReminders().catch((err) => logger.warn(`Reminders: ${err.message}`));
}, REMINDER_TICK_MS);
reminderTimer.unref?.();
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
