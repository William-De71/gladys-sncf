// -----------------------------------------------------------------------------
// Client of the SNCF API (https://api.sncf.com, a Navitia instance).
//
// Every call is a GET under `https://api.sncf.com/v1/coverage/sncf/`, the API
// key as the user name of an HTTP Basic authentication (empty password).
//
// What the API answers, and what the client makes of it:
//   - 401 / 403        the key is missing, unknown or not allowed on the
//                      coverage: a configuration error, never retried;
//   - 429              the quota is exhausted (5 000 requests a day, 150 000
//                      a month): the SNCF blocks the key until the quota
//                      resets. `Retry-After` when present, an hour otherwise;
//   - 404 `no_solution` on /journeys: no train matches, an empty answer;
//   - other 404        `{ error: { id, message } }`: date out of bounds,
//                      unknown station…;
//   - 5xx / network    retried once after a short pause.
//
// Every request leaving the container is counted (see quota.js), failed
// ones included: they count on the SNCF side too.
// -----------------------------------------------------------------------------

// SNCF_API_URL: development only (a fake API for the end-to-end test).
const API_URL = process.env.SNCF_API_URL || 'https://api.sncf.com/v1/coverage/sncf/';
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 2000;
const DEFAULT_RETRY_AFTER_S = 3600;
const STOP_AREA_REGEX = /^stop_area:[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+$/;

/**
 * @description Error of an SNCF API call.
 */
class SncfError extends Error {
  /**
   * @param {string} message - The message.
   * @param {object} [details] - Details.
   * @param {number} [details.status] - The HTTP status (0 for a network failure).
   * @param {string} [details.id] - The Navitia error id (`date_out_of_bounds`…).
   * @param {number} [details.retryAfter] - Seconds to wait, on a 429.
   */
  constructor(message, { status = 0, id = '', retryAfter = 0 } = {}) {
    super(message);
    this.name = 'SncfError';
    this.status = status;
    this.id = id;
    this.retryAfter = retryAfter;
  }

  /** @returns {boolean} The key is refused. */
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }

  /** @returns {boolean} The quota is exhausted. */
  get isQuota() {
    return this.status === 429;
  }
}

/**
 * @description Build the User-Agent: the product and its URL.
 * @param {object} options - Options.
 * @param {string} options.name - The package name.
 * @param {string} options.version - The integration version.
 * @param {string} [options.homepage] - The project URL.
 * @returns {string} The User-Agent header.
 * @example
 * buildUserAgent({ name: 'gladys-sncf', version: '0.1.0' }); // -> 'gladys-sncf/0.1.0'
 */
function buildUserAgent({ name, version, homepage = '' }) {
  return homepage ? `${name}/${version} (+${homepage})` : `${name}/${version}`;
}

/**
 * @description Whether a value is a Navitia stop area id.
 * @param {unknown} value - The value.
 * @returns {boolean} True for "stop_area:SNCF:87471003".
 * @example
 * isStopAreaId('stop_area:SNCF:87471003'); // -> true
 */
function isStopAreaId(value) {
  return typeof value === 'string' && STOP_AREA_REGEX.test(value);
}

/**
 * @description Read the Retry-After header.
 * @param {string|null} header - The header.
 * @returns {number} Seconds, the default when absent or unreadable.
 */
function readRetryAfter(header) {
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds, 86400);
  }
  const date = Date.parse(header ?? '');
  if (Number.isFinite(date)) {
    return Math.max(60, Math.min(86400, Math.round((date - Date.now()) / 1000)));
  }
  return DEFAULT_RETRY_AFTER_S;
}

/**
 * @description Build a query string; arrays repeat their key (`type[]=a&type[]=b`).
 * @param {object} params - The parameters (undefined/null values skipped).
 * @returns {string} The query string, without "?".
 * @example
 * buildQuery({ q: 'Rennes', 'type[]': ['stop_area'] }); // -> 'q=Rennes&type%5B%5D=stop_area'
 */
function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    (Array.isArray(value) ? value : [value]).forEach((item) => search.append(key, String(item)));
  });
  return search.toString();
}

/**
 * @description Create the SNCF client.
 * @param {object} options - Options.
 * @param {Function} options.getApiKey - `() => string`, read on every call.
 * @param {Function} options.getUserAgent - `() => string`.
 * @param {Function} [options.onRequest] - Called once per request sent (quota).
 * @param {Function} [options.fetchImpl] - fetch, for the tests.
 * @param {number} [options.retryDelayMs] - Pause before the retry.
 * @returns {object} The client.
 * @example
 * const sncf = createSncfClient({ getApiKey: () => key, getUserAgent: () => 'gladys-sncf/0.1.0' });
 */
function createSncfClient({
  getApiKey,
  getUserAgent,
  onRequest = () => {},
  fetchImpl = globalThis.fetch,
  retryDelayMs = RETRY_DELAY_MS,
}) {
  /**
   * @description One attempt of a GET.
   * @param {string} url - The full URL.
   * @param {string} apiKey - The key.
   * @returns {Promise<object>} The JSON answer.
   */
  async function attempt(url, apiKey) {
    onRequest();
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
          Accept: 'application/json',
          'User-Agent': getUserAgent(),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new SncfError(`SNCF API unreachable: ${err.message}`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.ok) {
      if (body === null || typeof body !== 'object') {
        throw new SncfError('SNCF API: unreadable answer', { status: response.status });
      }
      return body;
    }
    const id = typeof body?.error?.id === 'string' ? body.error.id : '';
    const message = body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new SncfError(`SNCF API: ${message}`, {
      status: response.status,
      id,
      retryAfter: response.status === 429 ? readRetryAfter(response.headers.get('retry-after')) : 0,
    });
  }

  /**
   * @description GET a path of the coverage, retried once on a transient failure.
   * @param {string} path - The path, under the coverage.
   * @param {object} [params] - The query parameters.
   * @returns {Promise<object>} The JSON answer.
   * @throws {SncfError} On failure.
   */
  async function get(path, params = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new SncfError('No SNCF API key', { status: 401 });
    }
    const query = buildQuery(params);
    const url = `${API_URL}${path}${query ? `?${query}` : ''}`;
    try {
      return await attempt(url, apiKey);
    } catch (err) {
      const transient = err.status === 0 || err.status >= 500;
      if (!transient) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return attempt(url, apiKey);
    }
  }

  return {
    get,

    /**
     * @description Search stations by name.
     * @param {string} query - The text typed.
     * @param {number} [count] - How many results.
     * @returns {Promise<Array<{ id: string, name: string, label: string }>>} The stations.
     */
    async searchStations(query, count = 8) {
      const answer = await get('places', { q: query, 'type[]': 'stop_area', count, depth: 1 });
      return (Array.isArray(answer.places) ? answer.places : [])
        .filter((place) => place?.embedded_type === 'stop_area' && isStopAreaId(place.id))
        .map((place) => ({
          id: place.id,
          name: String(place.stop_area?.name || place.name || place.id),
          label: String(place.name || place.stop_area?.label || place.stop_area?.name || ''),
        }));
    },

    /**
     * @description Read a station by id.
     * @param {string} id - The stop area id.
     * @returns {Promise<{ id: string, name: string, label: string }|null>} The station, null when unknown.
     */
    async getStation(id) {
      if (!isStopAreaId(id)) {
        return null;
      }
      try {
        const answer = await get(`stop_areas/${encodeURIComponent(id)}`, { depth: 0 });
        const area = Array.isArray(answer.stop_areas) ? answer.stop_areas[0] : null;
        return area ? { id, name: String(area.name || id), label: String(area.label || '') } : null;
      } catch (err) {
        if (err.status === 404 || err.status === 400) {
          return null;
        }
        throw err;
      }
    },

    /**
     * @description Direct trains between two stations.
     * @param {object} options - Options.
     * @param {string} options.from - The departure stop area id.
     * @param {string} options.to - The arrival stop area id.
     * @param {string} options.datetime - "YYYYMMDDTHHMMSS", Paris time.
     * @param {number} options.count - How many journeys.
     * @param {'realtime'|'base_schedule'} options.freshness - The data.
     * @returns {Promise<object>} The answer (`journeys: []` when none).
     */
    async journeys({ from, to, datetime, count, freshness }) {
      try {
        return await get('journeys', {
          from,
          to,
          datetime,
          datetime_represents: 'departure',
          data_freshness: freshness,
          count,
          min_nb_journeys: count,
          max_nb_transfers: 0,
          direct_path: 'none',
          depth: 1,
        });
      } catch (err) {
        if (err.status === 404 && err.id === 'no_solution') {
          return { journeys: [], disruptions: [] };
        }
        throw err;
      }
    },

    /**
     * @description The departures of a station.
     * @param {object} options - Options.
     * @param {string} options.stopArea - The stop area id.
     * @param {string} options.fromDatetime - "YYYYMMDDTHHMMSS", Paris time.
     * @param {number} options.count - How many departures.
     * @param {number} [options.duration] - The window, in seconds.
     * @param {'realtime'|'base_schedule'} [options.freshness] - The data.
     * @returns {Promise<object>} The answer (`departures: []` when none).
     */
    async departures({ stopArea, fromDatetime, count, duration = 21600, freshness = 'realtime' }) {
      try {
        return await get(`stop_areas/${encodeURIComponent(stopArea)}/departures`, {
          from_datetime: fromDatetime,
          duration,
          count,
          data_freshness: freshness,
          depth: 1,
        });
      } catch (err) {
        if (err.status === 404 && /^no_(departure|active_circulation)|terminus/.test(err.id)) {
          return { departures: [], disruptions: [] };
        }
        throw err;
      }
    },
  };
}

export { API_URL, SncfError, buildUserAgent, buildQuery, isStopAreaId, createSncfClient };
