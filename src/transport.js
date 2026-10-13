// -----------------------------------------------------------------------------
// The transport badge of each trip (Devices screen of Gladys).
//
// Everything comes from the SNCF API, so the badge says `cloud` while the last
// read of the trip worked, and `unreachable` when it failed (API down, key
// refused). When the reads are paused by the quota — the daily quota of the
// API, or the integration slowing down before it — the badge stays `cloud`
// but is flagged `degraded` with the reason: the values may be old.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { all } from './i18n.js';

/**
 * @description The transport entry of a trip.
 * @param {string} externalId - The device external id.
 * @param {Error|null} error - The error of the last read, null when it worked.
 * @returns {object} The `publishTransports` entry.
 * @example
 * transportOf('ext:sncf:trip:87471003-87481002', null);
 */
function transportOf(externalId, error) {
  if (!error) {
    return { external_id: externalId, transport: DEVICE_TRANSPORTS.CLOUD };
  }
  if (error.budget || error.isQuota) {
    return {
      external_id: externalId,
      transport: DEVICE_TRANSPORTS.CLOUD,
      degraded: true,
      message: all(error.budget ? 'transportBudget' : 'transportQuota'),
    };
  }
  return { external_id: externalId, transport: DEVICE_TRANSPORTS.UNREACHABLE };
}

export { transportOf };
