// -----------------------------------------------------------------------------
// The request quota of the SNCF API.
//
// The free key allows 5 000 requests a day (150 000 a month). Past it, the
// SNCF blocks the key until the quota resets — for hours. So the integration
// counts its own requests over a sliding 24 hours, and stops reading the
// trips a little before the limit (BUDGET), keeping a margin for the widgets,
// the scene actions and the configuration screen.
//
// A 429 from the API blocks every request until its Retry-After (an hour when
// absent): hammering a blocked key only extends nothing and spams the logs.
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000;
const DAILY_LIMIT = 5000;
// The rounds of the trips stop here; the last requests are kept for the user.
const BUDGET = 4500;
const SAVE_DELAY_MS = 30000;

/**
 * @description Create the quota counter.
 * @param {object} [options] - Options.
 * @param {object} [options.store] - Where the counts survive a restart.
 * @param {Function} [options.now] - The clock.
 * @returns {object} The counter.
 * @example
 * const quota = createQuota({ store: createStore('quota.json') });
 */
function createQuota({ store = null, now = Date.now } = {}) {
  let stamps = [];
  let blockedUntil = 0;
  let saveTimer = null;

  const prune = () => {
    const since = now() - DAY_MS;
    if (stamps.length > 0 && stamps[0] <= since) {
      stamps = stamps.filter((stamp) => stamp > since);
    }
  };

  const scheduleSave = () => {
    if (!store || saveTimer) {
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      store.save({ stamps, blocked_until: blockedUntil });
    }, SAVE_DELAY_MS);
    saveTimer.unref?.();
  };

  return {
    /**
     * @description Read the counts saved before a restart.
     * @returns {Promise<void>}
     */
    async load() {
      const saved = store ? await store.load(null) : null;
      if (saved && Array.isArray(saved.stamps)) {
        stamps = saved.stamps.filter(Number.isFinite).sort((a, b) => a - b);
        blockedUntil = Number.isFinite(saved.blocked_until) ? saved.blocked_until : 0;
        prune();
      }
    },

    /** @description Count one request sent. */
    record() {
      stamps.push(now());
      prune();
      scheduleSave();
    },

    /**
     * @description Block every request after a 429.
     * @param {number} seconds - The Retry-After.
     */
    block(seconds) {
      blockedUntil = Math.max(blockedUntil, now() + seconds * 1000);
      scheduleSave();
    },

    /** @returns {number} The requests of the last 24 hours. */
    used() {
      prune();
      return stamps.length;
    },

    /** @returns {number} When the 429 block ends (ms), 0 when not blocked. */
    blockedUntil() {
      return blockedUntil > now() ? blockedUntil : 0;
    },

    /** @returns {boolean} Whether the rounds of the trips may run. */
    canPoll() {
      return this.blockedUntil() === 0 && this.used() < BUDGET;
    },

    /** @returns {boolean} Whether any request may be sent. */
    canRequest() {
      return this.blockedUntil() === 0 && this.used() < DAILY_LIMIT;
    },

    /** @description Write the pending counts now (shutdown). */
    async flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (store) {
        await store.save({ stamps, blocked_until: blockedUntil });
      }
    },
  };
}

export { DAILY_LIMIT, BUDGET, createQuota };
