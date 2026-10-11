// -----------------------------------------------------------------------------
// The loop reading the trips.
//
// Each trip has its own chain of timers: every `poll_interval` minutes around
// its travel window, every `idle_interval` minutes otherwise (schedule.js).
// A read costs 2 requests (timetable + real time, see trains.js), 3 when a
// cancellation has to be confirmed on the departures board.
//
// The last read of each trip is kept (`snapshot`): the widgets and the scene
// actions reuse it while it is fresh instead of spending the quota.
//
// When the quota is close (quota.js) or the API blocks the key (429), the
// reads pause and retry later; a failing API backs off up to the idle
// interval.
// -----------------------------------------------------------------------------

import { confirmSuspected, mergeTrains, parseJourneys, DEPARTURES_COUNT } from './trains.js';
import { followedSpan, upcoming, nextDelay } from './schedule.js';
import { toNavitiaDate } from './time.js';

const MAX_JOURNEYS = 12;
const QUOTA_RETRY_MS = 15 * 60 * 1000;

/**
 * @description What changes in a list of trains for the user.
 * @param {object[]} trains - The trains.
 * @returns {string} The signature.
 */
function signature(trains) {
  return JSON.stringify(
    trains.map((train) => [train.id, train.departure, train.arrival, train.cancelled, train.cause]),
  );
}

/**
 * @description Read the followed trains of a trip, once.
 * @param {object} sncf - The SNCF client.
 * @param {object} trip - The resolved trip.
 * @param {number} trainCount - How many trains to follow.
 * @param {number} now - Now (ms).
 * @returns {Promise<{ trains: object[], span: object, readAt: number }>} The snapshot.
 * @example
 * await readTrip(sncf, trip, 4, Date.now());
 */
async function readTrip(sncf, trip, trainCount, now) {
  const span = followedSpan(trip, now);
  const request = {
    from: trip.from.id,
    to: trip.to.id,
    datetime: toNavitiaDate(span.from),
    count: Math.min(MAX_JOURNEYS, trainCount + 4),
  };
  const stations = { from: trip.from.id, to: trip.to.id };
  const base = parseJourneys(
    await sncf.journeys({ ...request, freshness: 'base_schedule' }),
    stations,
  );
  const live = parseJourneys(await sncf.journeys({ ...request, freshness: 'realtime' }), stations);
  let trains = mergeTrains(base, live);
  const suspected = trains.filter((train) => train.suspected);
  if (suspected.length > 0) {
    let board;
    try {
      board = await sncf.departures({
        stopArea: trip.from.id,
        fromDatetime: toNavitiaDate(Math.min(...suspected.map((train) => train.baseDeparture))),
        count: DEPARTURES_COUNT,
      });
    } catch (err) {
      if (err.isQuota || err.isAuth) {
        throw err;
      }
      board = null;
    }
    trains = confirmSuspected(trains, board);
  }
  return { trains: upcoming(trains, span, now, trainCount), span, readAt: now };
}

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.sncf - The SNCF client.
 * @param {object} options.quota - The quota counter.
 * @param {Function} options.getTrips - `() => resolved trips`.
 * @param {Function} options.getSettings - `() => ({ trainCount, pollInterval, idleInterval })`.
 * @param {Function} options.onRead - `(trip, snapshot, { changed }) => Promise`.
 * @param {Function} [options.onError] - `(trip, err) => Promise`.
 * @param {object} [options.logger] - The logger.
 * @param {Function} [options.now] - The clock.
 * @returns {object} The watcher.
 */
function createWatcher({
  sncf,
  quota,
  getTrips,
  getSettings,
  onRead,
  onError = async () => {},
  logger = null,
  now = Date.now,
}) {
  // trip key -> { snapshot, signature, timer, pending, failures, error }
  const states = new Map();
  let running = false;

  const stateOf = (key) => {
    if (!states.has(key)) {
      states.set(key, {
        snapshot: null,
        signature: null,
        timer: null,
        pending: null,
        failures: 0,
        error: null,
      });
    }
    return states.get(key);
  };

  /**
   * @description Read a trip now (one read at a time per trip).
   * @param {object} trip - The resolved trip.
   * @returns {Promise<object>} The snapshot.
   */
  function read(trip) {
    const state = stateOf(trip.key);
    if (!state.pending) {
      state.pending = (async () => {
        try {
          const snapshot = await readTrip(sncf, trip, getSettings().trainCount, now());
          const sig = signature(snapshot.trains);
          const changed = sig !== state.signature;
          state.snapshot = snapshot;
          state.signature = sig;
          state.failures = 0;
          state.error = null;
          await onRead(trip, snapshot, { changed });
          return snapshot;
        } catch (err) {
          state.failures += 1;
          state.error = err;
          if (err.isQuota) {
            quota.block(err.retryAfter);
          }
          await onError(trip, err);
          throw err;
        } finally {
          state.pending = null;
        }
      })();
    }
    return state.pending;
  }

  /**
   * @description Arm the next read of a trip.
   * @param {object} trip - The resolved trip.
   */
  function schedule(trip) {
    const state = stateOf(trip.key);
    clearTimeout(state.timer);
    if (!running) {
      return;
    }
    const settings = getSettings();
    let delay = nextDelay(trip, now(), settings);
    if (state.failures > 0) {
      delay = Math.min(
        settings.idleInterval * 60000,
        settings.pollInterval * 60000 * 2 ** state.failures,
      );
    }
    const blockedUntil = quota.blockedUntil();
    if (blockedUntil) {
      delay = Math.max(delay, blockedUntil - now() + 1000);
    }
    state.timer = setTimeout(() => tick(trip.key), delay);
    state.timer.unref?.();
  }

  /**
   * @description A timer fired: read the trip if it is still configured.
   * @param {string} key - The trip key.
   * @returns {Promise<void>}
   */
  async function tick(key) {
    const trip = getTrips().find((candidate) => candidate.key === key);
    if (!trip || !running) {
      return;
    }
    if (!quota.canPoll()) {
      const state = stateOf(key);
      clearTimeout(state.timer);
      state.timer = setTimeout(
        () => tick(key),
        Math.max(QUOTA_RETRY_MS, quota.blockedUntil() - now()),
      );
      state.timer.unref?.();
      await onError(trip, Object.assign(new Error('quota'), { budget: true }));
      return;
    }
    try {
      await read(trip);
    } catch (err) {
      logger?.warn(`${trip.name}: ${err.message}`);
    }
    schedule(trip);
  }

  return {
    /** @description Allow the reads; `reschedule` arms them (config applied). */
    start() {
      running = true;
    },

    /** @description Stop every timer. */
    stop() {
      running = false;
      states.forEach((state) => clearTimeout(state.timer));
    },

    /**
     * @description Forget the trips removed from the configuration, and read
     * every configured trip now (a change of configuration, a reconnection).
     */
    reschedule() {
      const keys = new Set(getTrips().map((trip) => trip.key));
      [...states.keys()].forEach((key) => {
        if (!keys.has(key)) {
          clearTimeout(states.get(key).timer);
          states.delete(key);
        }
      });
      if (!running) {
        return;
      }
      getTrips().forEach((trip) => {
        const state = stateOf(trip.key);
        state.signature = null;
        state.failures = 0;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => tick(trip.key), 0);
        state.timer.unref?.();
      });
    },

    /**
     * @description The snapshot of a trip, read again when older than `maxAgeMs`.
     * @param {object} trip - The resolved trip.
     * @param {number} maxAgeMs - The freshness wanted.
     * @returns {Promise<object>} The snapshot.
     */
    async get(trip, maxAgeMs) {
      const state = stateOf(trip.key);
      if (state.snapshot && now() - state.snapshot.readAt <= maxAgeMs) {
        return state.snapshot;
      }
      if (!quota.canRequest() && state.snapshot) {
        return state.snapshot;
      }
      return read(trip);
    },

    /**
     * @description The last snapshot of a trip, without any request.
     * @param {string} key - The trip key.
     * @returns {object|null} The snapshot.
     */
    peek(key) {
      return states.get(key)?.snapshot ?? null;
    },

    /**
     * @description The last error of each trip (null when the last read worked).
     * @returns {Array<{ key: string, error: Error|null }>} The errors.
     */
    errors() {
      return getTrips().map((trip) => ({
        key: trip.key,
        error: states.get(trip.key)?.error ?? null,
      }));
    },
  };
}

export { readTrip, createWatcher };
