// -----------------------------------------------------------------------------
// The stations of the trips.
//
// The form takes what the user knows: a station name ("Rennes", "Lyon Part
// Dieu"), a UIC code ("87471003", printed on the station pages of the SNCF)
// or a Navitia id ("stop_area:SNCF:87471003", what the "Find a station"
// button answers). Each one becomes a stop area: the whole station, every
// platform and every kind of train (a stop point would miss some).
//
// A name is searched once and remembered (in /data, see store.js): the
// first result of the SNCF search. When it is not the right one, the user
// types the id the "Find a station" button shows instead.
//
// The SNCF renumbered its stations on 24 November 2026 (NeTEx / SIRI): a
// remembered id the API no longer knows is forgotten (`forget`) and what the
// user typed is resolved again. A UIC code is looked up on the codes of the
// stations, the new ids no longer holding it.
// -----------------------------------------------------------------------------

import { isStopAreaId } from './sncf-api.js';

const UIC_REGEX = /^(?:00)?(\d{8})$/;
const MAX_CACHE_ENTRIES = 50;

/**
 * @description Create the station resolver.
 * @param {object} options - Options.
 * @param {object} options.sncf - The SNCF client.
 * @param {object} [options.store] - Where the resolved stations are remembered.
 * @returns {object} The resolver.
 * @example
 * const stations = createStations({ sncf, store: createStore('stations.json') });
 * await stations.resolve('Rennes'); // -> { id: 'stop_area:SNCF:87471003', name: 'Rennes' }
 */
function createStations({ sncf, store = null }) {
  let cache = {};
  let loaded = false;

  const load = async () => {
    if (!loaded) {
      const saved = store ? await store.load({}) : {};
      cache = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      loaded = true;
    }
  };

  const remember = (key, station) => {
    cache[key] = { id: station.id, name: station.name, uic: station.uic || '' };
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys.slice(0, keys.length - MAX_CACHE_ENTRIES).forEach((old) => delete cache[old]);
    }
    store?.save(cache);
  };

  return {
    /**
     * @description Resolve what the user typed.
     * @param {string} input - A name, a UIC code or a stop area id.
     * @returns {Promise<{ id: string, name: string, uic: string }|null>} The station, null when none matches.
     * @throws {SncfError} When the API fails (unreachable, refused key…).
     */
    async resolve(input) {
      await load();
      const text = String(input ?? '').trim();
      if (!text) {
        return null;
      }
      const key = text.toLowerCase();
      if (cache[key]?.id) {
        return { uic: '', ...cache[key] };
      }
      const uic = UIC_REGEX.exec(text.replace(/\s/g, ''));
      let station;
      if (uic) {
        station = await sncf.getStationByUic(uic[1]);
      } else if (isStopAreaId(text)) {
        station = await sncf.getStation(text);
      } else {
        [station = null] = await sncf.searchStations(text, 1);
      }
      if (station) {
        remember(key, station);
        return { id: station.id, name: station.name, uic: station.uic || '' };
      }
      return null;
    },

    /**
     * @description The station already resolved for an input, without any request.
     * @param {string} input - What the user typed.
     * @returns {{ id: string, name: string }|null} The station.
     */
    peek(input) {
      const entry =
        cache[
          String(input ?? '')
            .trim()
            .toLowerCase()
        ] ?? null;
      return entry ? { uic: '', ...entry } : null;
    },

    /**
     * @description Forget the inputs resolved to station ids the API no longer knows.
     * @param {string[]} ids - The stop area ids.
     * @returns {Promise<number>} How many inputs were forgotten.
     */
    async forget(ids) {
      await load();
      const stale = new Set(ids);
      const keys = Object.keys(cache).filter((key) => stale.has(cache[key]?.id));
      keys.forEach((key) => delete cache[key]);
      if (keys.length > 0) {
        store?.save(cache);
      }
      return keys.length;
    },
  };
}

export { createStations };
