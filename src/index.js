/**
 * CronRadar Node.js SDK
 *
 * Dead-simple cron job monitoring with auto-registration support.
 * Primary function: monitor() for execution confirmation. Advanced: sync() for pre-registration.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Monitor a job execution by recording it in CronRadar.
 * Optionally provide schedule for self-healing (auto-registration on 404).
 *
 * @param {string} monitorKey - The monitor key identifying your job
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.schedule] - Cron expression for auto-registration if monitor doesn't exist
 * @param {number} [options.gracePeriod] - Grace period in seconds for auto-registration
 * @returns {Promise<void>}
 */
async function monitor(monitorKey, options = {}) {
  try {
    const apiKey = process.env.CRONRADAR_API_KEY || '';
    if (!apiKey) {
      console.error(`[CronRadar] Warning: CRONRADAR_API_KEY environment variable not set. Monitor '${monitorKey}' will not be tracked.`);
      return;
    }

    // Try to ping
    const statusCode = await sendPingInternal(monitorKey, apiKey);

    // Self-healing: if monitor doesn't exist and schedule provided, create it
    if (statusCode === 404 && options.schedule) {
      console.error(`[CronRadar] Monitor '${monitorKey}' not found. Auto-registering with schedule '${options.schedule}'...`);

      const source = detectSource();
      await syncMonitor(monitorKey, options.schedule, { source });

      // Retry ping
      await sendPingInternal(monitorKey, apiKey);
    }
  } catch (error) {
    // Never throw - protect user's job execution
    console.error(`[CronRadar] Error during ping: ${error.message}`);
  }
}

/**
 * Signal that a job has started executing.
 * Used for lifecycle tracking to detect hung jobs and measure execution duration.
 *
 * @param {string} monitorKey - The monitor key identifying your job
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.schedule] - Cron expression for auto-registration
 * @returns {Promise<void>}
 */
async function startJob(monitorKey, options = {}) {
  try {
    const apiKey = process.env.CRONRADAR_API_KEY || '';
    if (!apiKey) return;

    await sendLifecyclePing(monitorKey, 'start', apiKey, options);
  } catch (error) {
    console.error(`[CronRadar] Error during startJob: ${error.message}`);
  }
}

/**
 * Signal that a job has completed successfully.
 * Used for lifecycle tracking to record completion time and calculate duration.
 *
 * @param {string} monitorKey - The monitor key identifying your job
 * @returns {Promise<void>}
 */
async function completeJob(monitorKey) {
  try {
    const apiKey = process.env.CRONRADAR_API_KEY || '';
    if (!apiKey) return;

    await sendLifecyclePing(monitorKey, 'complete', apiKey);
  } catch (error) {
    console.error(`[CronRadar] Error during completeJob: ${error.message}`);
  }
}

/**
 * Signal that a job has failed.
 * Triggers immediate alerts without waiting for grace period.
 *
 * @param {string} monitorKey - The monitor key identifying your job
 * @param {string} [message] - Optional failure message for debugging
 * @returns {Promise<void>}
 */
async function failJob(monitorKey, message = null) {
  try {
    const apiKey = process.env.CRONRADAR_API_KEY || '';
    if (!apiKey) return;

    await sendLifecyclePing(monitorKey, 'fail', apiKey, { message });
  } catch (error) {
    console.error(`[CronRadar] Error during failJob: ${error.message}`);
  }
}

/**
 * Wrap an async function with automatic lifecycle monitoring.
 * Handles start/complete/fail signals automatically.
 *
 * Example:
 *   const backupJob = cronradar.wrap('backup-job', async () => {
 *     await runBackup();
 *   });
 *   await backupJob();
 *
 * @param {string} monitorKey - The monitor key identifying your job
 * @param {Function} func - The async function to wrap
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.schedule] - Cron expression for auto-registration
 * @returns {Function} Wrapped function
 */
function wrap(monitorKey, func, options = {}) {
  return async function(...args) {
    await startJob(monitorKey, options);
    try {
      const result = await func(...args);
      await completeJob(monitorKey);
      return result;
    } catch (error) {
      await failJob(monitorKey, error.message);
      throw error; // Re-raise to preserve original behavior
    }
  };
}

/**
 * Pre-register a monitor with CronRadar, setting up expectations for when it should run.
 * Used internally by extensions to sync discovered jobs. Advanced usage only.
 *
 * @param {string} monitorKey - The unique identifier for this monitor
 * @param {string} schedule - Cron expression defining when the job runs
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.source] - Source framework (e.g., "bull", "agenda"). Auto-detected if null.
 * @param {string} [options.name] - Human-readable name. Generated from key if null.
 * @param {number} [options.gracePeriod=60] - Grace period in seconds before alerting
 * @returns {Promise<void>}
 */
async function syncMonitor(monitorKey, schedule, options = {}) {
  try {
    const apiKey = process.env.CRONRADAR_API_KEY || '';
    if (!apiKey) {
      console.error(`[CronRadar] Warning: CRONRADAR_API_KEY environment variable not set. Monitor '${monitorKey}' will not be synced.`);
      return;
    }

    const source = options.source || detectSource();
    const name = options.name || generateReadableName(monitorKey);

    const syncRequest = {
      source,
      monitors: [{
        key: monitorKey,
        name,
        schedule,
        gracePeriod: 60
      }]
    };

    const url = new URL('/api/sync', 'https://cron.life');

    const response = await makeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64')
      },
      body: JSON.stringify(syncRequest),
      timeout: 5000
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.error(`[CronRadar] Monitor '${monitorKey}' synced successfully.`);
    } else {
      console.error(`[CronRadar] Failed to sync monitor '${monitorKey}': HTTP ${response.statusCode}`);
    }
  } catch (error) {
    console.error(`[CronRadar] Error syncing monitor '${monitorKey}': ${error.message}`);
    // Never throw - protect user's job execution
  }
}

/**
 * Send ping internally and return status code
 * @private
 */
async function sendPingInternal(monitorKey, apiKey) {
  try {
    // URL-based auth: /ping/{monitorKey}/{apiKey}
    const url = new URL(`/ping/${encodeURIComponent(monitorKey)}/${encodeURIComponent(apiKey)}`, 'https://cron.life');

    const response = await makeRequest(url, {
      method: 'GET',
      timeout: 5000
    });

    return response.statusCode;
  } catch (error) {
    return null;
  }
}

/**
 * Send lifecycle ping (start/complete/fail) internally
 * @private
 */
async function sendLifecyclePing(monitorKey, endpoint, apiKey, options = {}) {
  try {
    // URL-based auth: /ping/{monitorKey}/{apiKey}/{endpoint}
    const url = new URL(`/ping/${encodeURIComponent(monitorKey)}/${encodeURIComponent(apiKey)}/${endpoint}`, 'https://cron.life');

    // Add query parameters
    const params = new URLSearchParams();
    if (options.schedule) {
      params.append('schedule', options.schedule);
    }
    if (options.message) {
      params.append('message', options.message);
    }

    if (params.toString()) {
      url.search = params.toString();
    }

    await makeRequest(url, {
      method: 'POST',
      timeout: 5000
    });
  } catch (error) {
    // Silently fail to protect job execution
  }
}

/**
 * Make HTTP/HTTPS request
 * @private
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 5000
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Detect the calling source/framework based on loaded modules and stack trace
 * @private
 */
function detectSource() {
  try {
    // Check for popular Node.js job frameworks
    if (require.cache[require.resolve.paths('bull')?.[0]]) {
      return 'bull';
    }
    if (require.cache[require.resolve.paths('agenda')?.[0]]) {
      return 'agenda';
    }
    if (require.cache[require.resolve.paths('node-cron')?.[0]]) {
      return 'node-cron';
    }
    if (require.cache[require.resolve.paths('bree')?.[0]]) {
      return 'bree';
    }

    // Check for web frameworks
    if (require.cache[require.resolve.paths('express')?.[0]]) {
      return 'express';
    }
    if (require.cache[require.resolve.paths('fastify')?.[0]]) {
      return 'fastify';
    }
    if (require.cache[require.resolve.paths('nest')?.[0]]) {
      return 'nestjs';
    }
  } catch (error) {
    // Ignore detection errors
  }

  return 'manual';
}

/**
 * Generate a human-readable name from a monitor key.
 * Converts kebab-case or snake_case to Title Case.
 * @private
 */
function generateReadableName(monitorKey) {
  if (!monitorKey) {
    return monitorKey;
  }

  // Handle kebab-case: "check-overdue-pings" -> "Check Overdue Pings"
  if (monitorKey.includes('-')) {
    return monitorKey
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Handle snake_case: "check_overdue_pings" -> "Check Overdue Pings"
  if (monitorKey.includes('_')) {
    return monitorKey
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Handle camelCase or PascalCase: "checkOverduePings" -> "Check Overdue Pings"
  if (/[a-z][A-Z]/.test(monitorKey)) {
    return monitorKey
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  // Default: just capitalize first letter
  return monitorKey.charAt(0).toUpperCase() + monitorKey.slice(1);
}

module.exports = {
  monitor,
  startJob,
  completeJob,
  failJob,
  wrap,
  syncMonitor
};
