/**
 * CronRadar Node.js SDK
 *
 * Dead-simple cron job monitoring with auto-registration support.
 * Two main functions: ping() for execution confirmation, syncMonitor() for registration.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Ping CronRadar to indicate your job has run successfully.
 * Optionally provide schedule for self-healing (auto-registration on 404).
 *
 * @param {string} monitorKey - The monitor key identifying your job
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.schedule] - Cron expression for auto-registration if monitor doesn't exist
 * @param {number} [options.gracePeriod] - Grace period in seconds for auto-registration
 * @returns {Promise<void>}
 */
async function ping(monitorKey, options = {}) {
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
      await syncMonitor(monitorKey, options.schedule, {
        source,
        gracePeriod: options.gracePeriod || 60
      });

      // Retry ping
      await sendPingInternal(monitorKey, apiKey);
    }
  } catch (error) {
    // Never throw - protect user's job execution
    console.error(`[CronRadar] Error during ping: ${error.message}`);
  }
}

/**
 * Register a monitor with CronRadar, setting up expectations for when it should run.
 * Used by extensions to sync discovered jobs.
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
    const gracePeriod = options.gracePeriod || 60;

    const syncRequest = {
      source,
      monitors: [{
        key: monitorKey,
        name,
        schedule,
        gracePeriod
      }]
    };

    const baseUrl = process.env.CRONRADAR_BASE_URL || 'https://cronradar.com';
    const url = new URL('/api/sync', baseUrl);

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
    const method = (process.env.CRONRADAR_METHOD || 'GET').toUpperCase();
    const baseUrl = process.env.CRONRADAR_BASE_URL || 'https://cronradar.com';
    const url = new URL(`/ping/${encodeURIComponent(monitorKey)}`, baseUrl);

    const response = await makeRequest(url, {
      method,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64')
      },
      timeout: 5000
    });

    return response.statusCode;
  } catch (error) {
    return null;
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
  ping,
  syncMonitor
};
