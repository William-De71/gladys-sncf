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
    cache[key] = { id: station.id, name: station.name };
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
     * @returns {Promise<{ id: string, name: string }|null>} The station, null when none matches.
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
        return cache[key];
      }
      const uic = UIC_REGEX.exec(text.replace(/\s/g, ''));
      let station;
      if (isStopAreaId(text) || uic) {
        station = await sncf.getStation(uic ? `stop_area:SNCF:${uic[1]}` : text);
      } else {
        [station = null] = await sncf.searchStations(text, 1);
      }
      if (station) {
        remember(key, station);
        return { id: station.id, name: station.name };
      }
      return null;
    },

    /**
     * @description The station already resolved for an input, without any request.
     * @param {string} input - What the user typed.
     * @returns {{ id: string, name: string }|null} The station.
     */
    peek(input) {
      return (
        cache[
          String(input ?? '')
            .trim()
            .toLowerCase()
        ] ?? null
      );
    },
  };
}

export { createStations };
