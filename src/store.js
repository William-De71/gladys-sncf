// -----------------------------------------------------------------------------
// Small JSON files in /data, the only writable place of the container.
//
// What survives a restart there: the requests of the last 24 hours (quota),
// the stations already resolved (no search spent on every start) and the
// scene events already fired (no duplicate after a restart).
//
// Best effort: a file that cannot be read starts empty, a failed write is
// logged and retried with the next one. Writes go through a temporary file
// and a rename, so a crash never leaves half a file.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env.SNCF_DATA_DIR || '/data';

/**
 * @description Create a JSON file store.
 * @param {string} name - The file name, e.g. "quota.json".
 * @param {object} [options] - Options.
 * @param {string} [options.dir] - The directory.
 * @param {object} [options.logger] - The logger.
 * @returns {{ load: Function, save: Function }} The store.
 * @example
 * const store = createStore('stations.json');
 * const value = await store.load({});
 */
function createStore(name, { dir = DATA_DIR, logger = null } = {}) {
  const path = join(dir, name);
  let writing = Promise.resolve();

  return {
    /**
     * @description Read the file.
     * @param {unknown} fallback - The value when the file is missing or unreadable.
     * @returns {Promise<unknown>} The value.
     */
    async load(fallback) {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        return fallback;
      }
    },

    /**
     * @description Write the file (writes are serialized).
     * @param {unknown} value - The value.
     * @returns {Promise<void>}
     */
    save(value) {
      const text = JSON.stringify(value);
      writing = writing.then(async () => {
        try {
          await mkdir(dir, { recursive: true });
          await writeFile(`${path}.tmp`, text, 'utf8');
          await rename(`${path}.tmp`, path);
        } catch (err) {
          logger?.warn(`Unable to write ${path}: ${err.message}`);
        }
      });
      return writing;
    },
  };
}

export { DATA_DIR, createStore };
