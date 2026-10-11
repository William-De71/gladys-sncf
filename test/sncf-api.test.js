import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSncfClient, buildQuery, isStopAreaId, API_URL } from '../src/sncf-api.js';

/**
 * @description A fake fetch answering from a list.
 * @param {Array<{ status: number, body?: unknown, headers?: object }|Error>} answers - The answers, in order.
 * @returns {Function} The fetch, with `calls`.
 */
function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = answers.shift();
    if (next instanceof Error) {
      throw next;
    }
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: new Map(Object.entries(next.headers ?? {})),
      json: async () => {
        if (next.body === undefined) {
          throw new SyntaxError('no body');
        }
        return next.body;
      },
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const client = (fetchImpl, counter = { n: 0 }) =>
  createSncfClient({
    getApiKey: () => 'the-key',
    getUserAgent: () => 'gladys-sncf/test',
    onRequest: () => {
      counter.n += 1;
    },
    fetchImpl,
    retryDelayMs: 0,
  });

test('authenticates with the key as the Basic user name, and counts the request', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { places: [] } }]);
  const counter = { n: 0 };
  await client(fetchImpl, counter).searchStations('Rennes');
  const [{ url, options }] = fetchImpl.calls;
  assert.ok(url.startsWith(`${API_URL}places?`));
  assert.ok(url.includes('type%5B%5D=stop_area'));
  assert.equal(
    options.headers.Authorization,
    `Basic ${Buffer.from('the-key:').toString('base64')}`,
  );
  assert.equal(options.headers['User-Agent'], 'gladys-sncf/test');
  assert.equal(counter.n, 1);
});

test('keeps the stop areas of a search, with their names', async () => {
  const fetchImpl = fakeFetch([
    {
      status: 200,
      body: {
        places: [
          {
            id: 'stop_area:SNCF:87471003',
            name: 'Rennes (Rennes)',
            embedded_type: 'stop_area',
            stop_area: { id: 'stop_area:SNCF:87471003', name: 'Rennes' },
          },
          { id: 'admin:fr:35238', name: 'Rennes', embedded_type: 'administrative_region' },
        ],
      },
    },
  ]);
  assert.deepEqual(await client(fetchImpl).searchStations('Rennes'), [
    { id: 'stop_area:SNCF:87471003', name: 'Rennes', label: 'Rennes (Rennes)' },
  ]);
});

test('turns "no_solution" into an empty journey list', async () => {
  const fetchImpl = fakeFetch([
    { status: 404, body: { error: { id: 'no_solution', message: 'no solution found' } } },
  ]);
  const answer = await client(fetchImpl).journeys({
    from: 'a',
    to: 'b',
    datetime: '20261012T070000',
    count: 4,
    freshness: 'realtime',
  });
  assert.deepEqual(answer.journeys, []);
  const url = new URL(fetchImpl.calls[0].url);
  assert.equal(url.searchParams.get('data_freshness'), 'realtime');
  assert.equal(url.searchParams.get('max_nb_transfers'), '0');
  assert.equal(url.searchParams.get('direct_path'), 'none');
});

test('reports a refused key without retrying (the real 401 has no error id)', async () => {
  const fetchImpl = fakeFetch([
    { status: 401, body: { message: 'Token absent in the database You can get one at …' } },
  ]);
  await assert.rejects(client(fetchImpl).searchStations('x'), (err) => {
    assert.equal(err.isAuth, true);
    assert.match(err.message, /Token absent/);
    return true;
  });
  assert.equal(fetchImpl.calls.length, 1);
});

test('reads the Retry-After of an exhausted quota, an hour by default', async () => {
  await assert.rejects(
    client(fakeFetch([{ status: 429, body: {}, headers: { 'retry-after': '120' } }])).get('places'),
    (err) => err.isQuota && err.retryAfter === 120,
  );
  await assert.rejects(
    client(fakeFetch([{ status: 429 }])).get('places'),
    (err) => err.isQuota && err.retryAfter === 3600,
  );
});

test('retries a server error or a network failure once', async () => {
  const fetchImpl = fakeFetch([new Error('ECONNRESET'), { status: 200, body: { ok: 1 } }]);
  assert.deepEqual(await client(fetchImpl).get('x'), { ok: 1 });
  const failing = fakeFetch([
    { status: 503, body: {} },
    { status: 502, body: {} },
  ]);
  await assert.rejects(client(failing).get('x'), (err) => err.status === 502);
  assert.equal(failing.calls.length, 2);
});

test('reads a station by id, null when the SNCF does not know it', async () => {
  const fetchImpl = fakeFetch([
    { status: 200, body: { stop_areas: [{ id: 'stop_area:SNCF:87471003', name: 'Rennes' }] } },
    { status: 404, body: { error: { id: 'unknown_object', message: 'nope' } } },
  ]);
  const sncf = client(fetchImpl);
  assert.equal((await sncf.getStation('stop_area:SNCF:87471003')).name, 'Rennes');
  assert.equal(await sncf.getStation('stop_area:SNCF:00000000'), null);
  assert.equal(await sncf.getStation('Rennes'), null);
  assert.equal(fetchImpl.calls.length, 2);
});

test('refuses to call without a key', async () => {
  const sncf = createSncfClient({
    getApiKey: () => '',
    getUserAgent: () => 'x',
    fetchImpl: () => {},
  });
  await assert.rejects(sncf.get('places'), (err) => err.isAuth);
});

test('builds the query strings and recognizes stop areas', () => {
  assert.equal(buildQuery({ a: 1, b: undefined, 'c[]': ['x', 'y'] }), 'a=1&c%5B%5D=x&c%5B%5D=y');
  assert.ok(isStopAreaId('stop_area:SNCF:87471003'));
  assert.ok(!isStopAreaId('stop_area:SNCF:87471003/../x'));
  assert.ok(!isStopAreaId('87471003'));
});
