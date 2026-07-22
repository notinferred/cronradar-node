# CronRadar Node.js SDK

The base SDK for monitoring scheduled jobs in Node.js. Wrap a function, send a heartbeat, or track full lifecycle — CronRadar tracks duration, alerts on missed schedules, and recovers from accidental monitor deletion.

Bull/BullMQ auto-discovery is in progress. For `node-cron` and other Node.js schedulers, use this base SDK's explicit wrapper; no node-cron auto-discovery package is currently supported.

## Install

```bash
npm install cronradar
# or
pnpm add cronradar
# or
yarn add cronradar
```

## Setup

The SDK reads its API key from the `CRONRADAR_API_KEY` environment variable.

```bash
export CRONRADAR_API_KEY=ck_app_xxxxxxxxxxxxxxxxxxxx
```

Get the API key from the CronRadar dashboard at [app.cronradar.com](https://app.cronradar.com) under your application's settings. API keys have the form `ck_app_<random>`.

Create a separate CronRadar application and API key for production, staging, and development. Store the key in the deployment platform's secret manager; never commit it, print it, or reuse a production key outside production.

The SDK does not require explicit initialization. The first call to any monitoring function reads the env var; if it's missing, the SDK logs a single warning to `stderr` and silently no-ops every subsequent call (per the "never break a user's job" guarantee).

## Quickstart

```javascript
const cronradar = require('cronradar');

// First-time call: pass `schedule` so the monitor auto-registers.
await cronradar.monitor('daily-backup', { schedule: '0 2 * * *' });

// Subsequent calls: just the key.
await cronradar.monitor('daily-backup');
```

That's the minimal integration. CronRadar:

- Creates the `daily-backup` monitor on the first ping (because `schedule` was provided)
- Records each subsequent ping
- Alerts you (email + any other configured channels) if the monitor doesn't ping within `0 2 * * *` plus its grace period
- Re-creates the monitor if you delete it from the dashboard and the schedule param is still being passed

## Manual lifecycle

For finer-grained tracking — duration measurement, explicit failure messages, hung-job detection — use the lifecycle endpoints.

```javascript
const cronradar = require('cronradar');

await cronradar.startJob('daily-backup');
try {
  await runBackup();
  await cronradar.completeJob('daily-backup');
} catch (error) {
  await cronradar.failJob('daily-backup', error.message);
  throw error; // always re-throw — monitoring observes, never alters behavior
}
```

Or wrap an async function and let the SDK call `start`/`complete`/`fail` for you:

```javascript
const backupJob = cronradar.wrap('daily-backup', async () => {
  await runBackup();
}, { schedule: '0 2 * * *' });

await backupJob();
```

The wrapper:

- Calls `startJob` before invoking your function
- Calls `completeJob` if it resolves
- Calls `failJob` with the error message if it throws
- Re-throws the original error so your error handlers run normally
- Auto-registers the monitor on first run if `schedule` is provided

## Reference

### `monitor(key, options?)`

Records a successful execution. Returns `Promise<void>`.

```javascript
await cronradar.monitor(key);
await cronradar.monitor(key, { schedule });
```

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `key` | `string` | yes | Monitor key. Lowercase, kebab/snake/dot-case. Max 200 chars. |
| `options.schedule` | `string` | optional | Standard 5-field cron expression. Required on the *first* ping for self-healing registration. |

Throws: never. Network errors and 4xx/5xx responses are caught and logged to `stderr`.

Grace period is configured per-monitor on CronRadar (default 60 seconds, set via the dashboard or the `gracePeriod` field passed to `syncMonitor`). It's not a per-ping argument.

### `startJob(key)`

Records that a job has begun executing. Returns `Promise<void>`.

```javascript
await cronradar.startJob(key);
```

Used in conjunction with `completeJob` or `failJob` to measure duration and detect hung jobs.

### `completeJob(key)`

Records successful completion. Returns `Promise<void>`.

```javascript
await cronradar.completeJob(key);
```

Pair with a prior `startJob(key)` to record duration in the dashboard.

### `failJob(key, message?)`

Records explicit failure. Returns `Promise<void>`.

```javascript
await cronradar.failJob(key, 'Database connection refused');
```

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `key` | `string` | yes | Monitor key. |
| `message` | `string` | optional | Human-readable failure detail, shown in the dashboard. |

Triggers an immediate alert (no grace period). The error message is rendered in the alert payload.

### `wrap(key, fn, options?)`

Wraps an async function with full lifecycle tracking. Returns a function that, when called, invokes `fn` with start/complete/fail tracking.

```javascript
const wrapped = cronradar.wrap(key, async () => { /* work */ }, { schedule });
await wrapped();
```

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `key` | `string` | yes | Monitor key. |
| `fn` | `() => Promise<T>` | yes | The async function to instrument. |
| `options.schedule` | `string` | optional | Cron expression for self-healing registration. |

The wrapped function returns whatever `fn` returns. If `fn` throws, the wrapper re-throws after recording the failure. Monitoring never swallows your exceptions.

### `syncMonitor(key, options)`

Pre-registers a monitor without sending a ping. Used by framework extensions during application startup. Returns `Promise<void>`.

```javascript
await cronradar.syncMonitor(key, {
  schedule: '0 2 * * *',
  source: 'node-cron',
  name: 'Daily Backup'
});
```

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `key` | `string` | yes | Monitor key. |
| `options.schedule` | `string` | yes | Cron expression. |
| `options.source` | `string` | optional | Identifier for the framework or origin. |
| `options.name` | `string` | optional | Human-readable display name. |

Used internally by extensions; rarely needed in application code.

## Configuration

| Environment variable | Required | Default | Purpose |
|---|---|---|---|
| `CRONRADAR_API_KEY` | yes | — | API key from the CronRadar dashboard. Format `ck_app_xxxxx`. |
| `CRONRADAR_DEBUG` | no | `false` | Set to `true` to log every request and error to stderr. |

The base URL (`https://cron.life`), HTTP timeout (5 seconds), and default grace period (60 seconds) are compile-time constants in `src/constants.js`. To customize them, fork the SDK or open an issue for a configurable hook.

## Error handling

The SDK upholds two hard guarantees:

1. **Never throws to user code.** Network errors, timeouts, 4xx/5xx responses, malformed payloads — all caught and logged to `stderr`. A failing CronRadar API must not break a user's cron job.
2. **Re-throws user-job exceptions.** When using `wrap`, the original error from your function always propagates. Monitoring observes; it does not change behavior.

What this looks like at runtime:

| Situation | SDK behavior | Your code |
|---|---|---|
| Network unreachable | Logs to stderr once per minute; returns | Continues normally |
| 5-second timeout | Logs to stderr; returns | Continues normally |
| 401 Unauthorized | Logs to stderr; returns | Continues normally |
| Wrapped function throws | Records `failJob`; re-throws | Receives the original error |
| Wrapped function rejects | Records `failJob`; re-throws | Receives the original rejection |
| `CRONRADAR_API_KEY` missing | Logs once per process; subsequent calls no-op | Continues normally |

If you need to know whether a ping succeeded — for example, in tests — the return value is `Promise<void>` either way; success is silent. Set `CRONRADAR_DEBUG=true` to log every request and error to stderr.

## Troubleshooting

### `401 Unauthorized` in stderr logs

Your `CRONRADAR_API_KEY` is wrong or missing. Verify:

```bash
test -n "$CRONRADAR_API_KEY" && echo "CronRadar key is set" || echo "CronRadar key is missing"
```

The key must match the one shown on **app.cronradar.com → your application → Settings → API Keys**. Keys are not retrievable after creation — if you lost it, create a new one and rotate.

### `404 Monitor Not Found` on first ping

You called `monitor(key)` without a `schedule` for a brand-new key. The first ping must include `schedule` so CronRadar can register the monitor:

```javascript
await cronradar.monitor('daily-backup', { schedule: '0 2 * * *' });
```

Subsequent pings can omit `schedule`. If you delete the monitor from the dashboard and the next ping doesn't include `schedule`, you'll see the same 404.

### My cron expression is rejected

CronRadar uses the standard 5-field POSIX cron format: `minute hour day-of-month month day-of-week`. Six-field expressions (with seconds) and Quartz-style 7-field expressions are not accepted. Common pitfalls:

| Wrong | Right |
|---|---|
| `0 0 2 * * *` (6 fields) | `0 2 * * *` |
| `0 2 ? * MON-FRI` (Quartz `?`) | `0 2 * * 1-5` |

### The job runs but I never see a ping in the dashboard

Three things to check, in order:

1. **API key** — see "401 Unauthorized" above.
2. **Network** — outbound HTTPS to `https://cron.life` may be blocked by firewall.
3. **Process termination** — short-lived scripts may exit before the async ping HTTP request completes. Always `await` the SDK calls. If your script is meant to fire-and-exit, ensure the event loop has time to flush:

```javascript
await cronradar.monitor('daily-backup');
process.exit(0);  // safe — await above ensures the ping completed
```

### Errors are silent in development

By default the SDK only writes to stderr when `CRONRADAR_DEBUG=true`. If you want to see what's happening during development:

```bash
CRONRADAR_DEBUG=true npm run dev
```

If `CRONRADAR_API_KEY` is unset entirely, the SDK no-ops every call without logging.

## Verification

Run the wrapped job once and confirm the intended CronRadar application shows the monitor plus a terminal `success` or `failed` result. Await SDK calls before a short-lived process exits.

Check authentication and outbound HTTPS without printing the key:

```bash
curl --fail-with-body --silent --show-error --user "$CRONRADAR_API_KEY:" "https://cron.life/api/v1/sync/status"
```

After a real run is visible, use the guided reliability drill to verify notification delivery without changing the production job.

## Migration

To replace a completion-only `monitor()` call, keep the same key and schedule, execute the job through `wrap()`, verify one successful and one controlled failed run, then remove the old heartbeat. `wrap()` records the failure and rethrows the original user exception, so scheduler behavior remains unchanged.

## Links

- **Documentation:** [docs.cronradar.com/integrations/node](https://docs.cronradar.com/integrations/node)
- **Monitoring overview:** [cronradar.com/nodejs](https://cronradar.com/nodejs)
- **Agent-friendly index:** [docs.cronradar.com/llms.txt](https://docs.cronradar.com/llms.txt)
- **OpenAPI spec:** [docs.cronradar.com/openapi.json](https://docs.cronradar.com/openapi.json)
- **npm:** [npmjs.com/package/cronradar](https://www.npmjs.com/package/cronradar)
- **GitHub:** [github.com/cronradar/cronradar-node](https://github.com/cronradar/cronradar-node)
- **Support:** support@cronradar.com

## License

© 2026 [CronRadar](https://cronradar.com) · Proprietary — see [LICENSE](./LICENSE).
