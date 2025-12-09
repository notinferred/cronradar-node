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
await cronradar.monitor('daily-backup', {
  schedule: '0 2 * * *',
  gracePeriod: 300
});
```

## Configuration

Set environment variable:
- `CRONRADAR_API_KEY`: Your API key from cronradar.com
- `CRONRADAR_BASE_URL`: Base URL override (optional, default: `https://cronradar.com`)
- `CRONRADAR_METHOD`: HTTP method for ping (optional, default: `GET`)

## Documentation

See [cronradar.com/docs](https://cronradar.com/docs) for full documentation.

## License

Proprietary - © 2025 CronRadar. All rights reserved.

See [LICENSE](./LICENSE) for details. This SDK may only be used with the CronRadar monitoring service.
