# CronRadar Node.js SDK

Monitor cron jobs with one function call.

## Installation

```bash
npm install cronradar
```

## Usage

```javascript
const cronradar = require('cronradar');

// After your cron job completes successfully
await cronradar.monitor('daily-backup');

// With self-healing (auto-register if monitor doesn't exist)
await cronradar.monitor('daily-backup', { schedule: '0 2 * * *' });
```

## Lifecycle Tracking

**Option 1: Wrapper (Automatic)**
```javascript
const backupJob = cronradar.wrap('daily-backup', async () => {
  await runBackup();
}, { schedule: '0 2 * * *' });

await backupJob();
```

**Option 2: Manual**
```javascript
await cronradar.startJob('daily-backup');
try {
  await runBackup();
  await cronradar.completeJob('daily-backup');
} catch (error) {
  await cronradar.failJob('daily-backup', error.message);
  throw error;
}
```

## Configuration

Set environment variable:
- `CRONRADAR_API_KEY`: Your CronRadar API key

## Links

- [Documentation](https://docs.cronradar.com)
- [npm](https://www.npmjs.com/package/cronradar)

## License

© 2025 [CronRadar](https://cronradar.com) - See [LICENSE](./LICENSE)
