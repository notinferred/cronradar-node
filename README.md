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
- `CRONRADAR_API_KEY`: Your API key from cronradar.com

## Documentation

See [cronradar.com/docs](https://cronradar.com/docs) for full documentation.

## License

Proprietary - © 2025 CronRadar. All rights reserved.

See [LICENSE](./LICENSE) for details. This SDK may only be used with the CronRadar monitoring service.
