// -----------------------------------------------------------------------------
// What happened to the followed trains, for the scene triggers.
//
//   - `train_delayed`    a train becomes late by at least the delay threshold,
//                        or moves up a delay level (minor: up to 14 min,
//                        major: 15 to 29, severe: 30 and more) — "+6 min"
//                        fires once, "+20 min" fires again, "+22 min" not;
//   - `train_cancelled`  a train is cancelled (or no longer stops at one of
//                        the stations of the trip);
//   - `departure_soon`   the next trains leave in N minutes (5, 10, 15, 20,
//                        30, 45 or 60), counted on the REAL-TIME departure:
//                        "leave home now" follows the delays. Checked every
//                        30 seconds on the last trains read, fired within 3
//                        minutes of the mark (never late after a restart).
//
// Every event fires once per train: what was fired is kept in /data for a
// day, so a restart never repeats a scene.
// -----------------------------------------------------------------------------

const SCENE_TRIGGERS = {
  TRAIN_DELAYED: 'train_delayed',
  TRAIN_CANCELLED: 'train_cancelled',
  DEPARTURE_SOON: 'departure_soon',
};

const DELAY_LEVELS = ['minor', 'major', 'severe'];
const REMINDER_MINUTES = [5, 10, 15, 20, 30, 45, 60];
const REMINDER_TOLERANCE_MIN = 3;
const KEEP_MS = 24 * 3600 * 1000;

/**
 * @description The delay level of a train.
 * @param {number} delay - The delay (minutes).
 * @param {number} threshold - The delay threshold (minutes).
 * @returns {string|null} 'minor', 'major', 'severe', null under the threshold.
 * @example
 * delayLevel(20, 5); // -> 'major'
 */
function delayLevel(delay, threshold) {
  if (!(delay >= threshold)) {
    return null;
  }
  if (delay < 15) {
    return 'minor';
  }
  return delay < 30 ? 'major' : 'severe';
}

/**
 * @description Create the tracker.
 * @param {object} [options] - Options.
 * @param {object} [options.store] - Where the fired events survive a restart.
 * @returns {object} The tracker.
 * @example
 * const tracker = createTracker({ store: createStore('fired.json') });
 */
function createTracker({ store = null } = {}) {
  // `<trip key>|<train id>` -> { level, cancelled, reminders: number[], at }
  let fired = {};
  let dirty = false;

  const entry = (tripKey, train) => {
    const key = `${tripKey}|${train.id}`;
    if (!fired[key]) {
      fired[key] = { level: null, cancelled: false, reminders: [], at: train.baseDeparture };
    }
    return fired[key];
  };

  return {
    /** @returns {Promise<void>} Read what was fired before a restart. */
    async load() {
      const saved = store ? await store.load({}) : {};
      fired = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    },

    /**
     * @description Compare a fresh read of a trip with what was fired.
     * @param {string} tripKey - The trip.
     * @param {object[]} trains - Its followed trains.
     * @param {number} threshold - The delay threshold (minutes).
     * @returns {Array<{ key: string, train: object, level?: string }>} The events.
     */
    diff(tripKey, trains, threshold) {
      const events = [];
      trains.forEach((train) => {
        const memory = entry(tripKey, train);
        if (train.cancelled) {
          if (!memory.cancelled) {
            memory.cancelled = true;
            dirty = true;
            events.push({ key: SCENE_TRIGGERS.TRAIN_CANCELLED, train });
          }
          return;
        }
        const level = delayLevel(train.delay, threshold);
        if (level && DELAY_LEVELS.indexOf(level) > DELAY_LEVELS.indexOf(memory.level)) {
          memory.level = level;
          dirty = true;
          events.push({ key: SCENE_TRIGGERS.TRAIN_DELAYED, train, level });
        }
      });
      return events;
    },

    /**
     * @description The departure reminders due now.
     * @param {string} tripKey - The trip.
     * @param {object[]} trains - Its followed trains.
     * @param {number} now - Now (ms).
     * @returns {Array<{ key: string, train: object, minutes: number }>} The events.
     */
    reminders(tripKey, trains, now) {
      const events = [];
      trains.forEach((train) => {
        if (train.cancelled) {
          return;
        }
        const left = (train.departure - now) / 60000;
        if (left <= 0) {
          return;
        }
        const memory = entry(tripKey, train);
        // The closest mark only: a train first seen 8 minutes before leaving
        // fires "10", never "10", "15", "20"… at once.
        const due = REMINDER_MINUTES.filter(
          (minutes) =>
            left <= minutes &&
            left > minutes - REMINDER_TOLERANCE_MIN &&
            !memory.reminders.includes(minutes),
        );
        if (due.length > 0) {
          const minutes = due[0];
          memory.reminders.push(...REMINDER_MINUTES.filter((m) => m >= minutes));
          memory.reminders = [...new Set(memory.reminders)];
          dirty = true;
          events.push({ key: SCENE_TRIGGERS.DEPARTURE_SOON, train, minutes });
        }
      });
      return events;
    },

    /**
     * @description Forget the trains of yesterday, and save.
     * @param {number} now - Now (ms).
     * @returns {Promise<void>}
     */
    async persist(now) {
      Object.keys(fired).forEach((key) => {
        if (fired[key].at < now - KEEP_MS) {
          delete fired[key];
          dirty = true;
        }
      });
      if (dirty && store) {
        dirty = false;
        await store.save(fired);
      }
    },
  };
}

export { SCENE_TRIGGERS, DELAY_LEVELS, REMINDER_MINUTES, delayLevel, createTracker };
