/**
 * Centralized constants for the CronRadar Node.js SDK.
 * Mirrors the .NET CronRadarConstants for cross-SDK consistency.
 */

const BASE_URL = 'https://cron.life';
const DEFAULT_TIMEOUT_MS = 5000; // 5 seconds, matches DEFAULT_TIMEOUT_SECONDS in other SDKs
const DEFAULT_GRACE_PERIOD_SECONDS = 60;
const MAX_MONITOR_KEY_LENGTH = 200;

const API_KEY_ENV_VAR = 'CRONRADAR_API_KEY';
const DEBUG_ENV_VAR = 'CRONRADAR_DEBUG';

/**
 * Validate a monitor key. Returns true if valid; logs a warning and returns false otherwise.
 * @param {string|null|undefined} monitorKey
 * @returns {boolean}
 */
function isValidMonitorKey(monitorKey) {
  if (typeof monitorKey !== 'string' || monitorKey.trim() === '') {
    console.error('[CronRadar] Invalid monitor key: must be a non-empty string.');
    return false;
  }
  if (monitorKey.length > MAX_MONITOR_KEY_LENGTH) {
    console.error(`[CronRadar] Invalid monitor key: length ${monitorKey.length} exceeds maximum of ${MAX_MONITOR_KEY_LENGTH} characters.`);
    return false;
  }
  return true;
}

module.exports = {
  BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_GRACE_PERIOD_SECONDS,
  MAX_MONITOR_KEY_LENGTH,
  API_KEY_ENV_VAR,
  DEBUG_ENV_VAR,
  isValidMonitorKey,
};
