/**
 * CronRadar Node.js SDK Tests
 */

const nock = require('nock');
const cronradar = require('../src/index');

describe('CronRadar Node.js SDK', () => {
  const originalEnv = process.env.CRONRADAR_API_KEY;

  beforeEach(() => {
    // Set up test API key
    process.env.CRONRADAR_API_KEY = 'test-api-key-123';
    // Clean up any pending nock mocks
    nock.cleanAll();
  });

  afterEach(() => {
    // Restore original environment
    process.env.CRONRADAR_API_KEY = originalEnv;
    nock.cleanAll();
  });

  describe('monitor()', () => {
    it('should send GET request to correct URL', async () => {
      const scope = nock('https://cron.life')
        .get('/ping/test-job/test-api-key-123')
        .reply(200, 'OK');

      await cronradar.monitor('test-job');

      expect(scope.isDone()).toBe(true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      await expect(cronradar.monitor('test-job')).resolves.toBeUndefined();
    });

    it('should URL encode special characters in monitor key', async () => {
      const scope = nock('https://cron.life')
        .get('/ping/test%20job%2Fspecial/test-api-key-123')
        .reply(200, 'OK');

      await cronradar.monitor('test job/special');

      expect(scope.isDone()).toBe(true);
    });

    it('should trigger sync on 404 when schedule provided', async () => {
      const pingScope = nock('https://cron.life')
        .get('/ping/test-job/test-api-key-123')
        .reply(404);

      const syncScope = nock('https://cron.life')
        .post('/api/sync')
        .reply(200, 'OK');

      const retryScope = nock('https://cron.life')
        .get('/ping/test-job/test-api-key-123')
        .reply(200, 'OK');

      await cronradar.monitor('test-job', { schedule: '* * * * *' });

      expect(pingScope.isDone()).toBe(true);
      expect(syncScope.isDone()).toBe(true);
      expect(retryScope.isDone()).toBe(true);
    });

    it('should not trigger sync on 404 without schedule', async () => {
      const pingScope = nock('https://cron.life')
        .get('/ping/test-job/test-api-key-123')
        .reply(404);

      await cronradar.monitor('test-job');

      expect(pingScope.isDone()).toBe(true);
    });

    it('should handle network errors gracefully', async () => {
      nock('https://cron.life')
        .get('/ping/test-job/test-api-key-123')
        .replyWithError('Connection refused');

      await expect(cronradar.monitor('test-job')).resolves.toBeUndefined();
    });
  });

  describe('startJob()', () => {
    it('should send POST request to start endpoint', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/start')
        .reply(200, 'OK');

      await cronradar.startJob('test-job');

      expect(scope.isDone()).toBe(true);
    });

    it('should include schedule query param when provided', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/start')
        .query({ schedule: '*/5 * * * *' })
        .reply(200, 'OK');

      await cronradar.startJob('test-job', { schedule: '*/5 * * * *' });

      expect(scope.isDone()).toBe(true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      await expect(cronradar.startJob('test-job')).resolves.toBeUndefined();
    });
  });

  describe('completeJob()', () => {
    it('should send POST request to complete endpoint', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/complete')
        .reply(200, 'OK');

      await cronradar.completeJob('test-job');

      expect(scope.isDone()).toBe(true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      await expect(cronradar.completeJob('test-job')).resolves.toBeUndefined();
    });
  });

  describe('failJob()', () => {
    it('should send POST request to fail endpoint', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/fail')
        .reply(200, 'OK');

      await cronradar.failJob('test-job');

      expect(scope.isDone()).toBe(true);
    });

    it('should include message query param when provided', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/fail')
        .query({ message: 'Job failed due to timeout' })
        .reply(200, 'OK');

      await cronradar.failJob('test-job', 'Job failed due to timeout');

      expect(scope.isDone()).toBe(true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      await expect(cronradar.failJob('test-job', 'error')).resolves.toBeUndefined();
    });
  });

  describe('wrap()', () => {
    it('should call startJob and completeJob on success', async () => {
      const startScope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/start')
        .reply(200, 'OK');

      const completeScope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/complete')
        .reply(200, 'OK');

      const wrappedFn = cronradar.wrap('test-job', async () => {
        return 'result';
      });

      const result = await wrappedFn();

      expect(result).toBe('result');
      expect(startScope.isDone()).toBe(true);
      expect(completeScope.isDone()).toBe(true);
    });

    it('should call startJob and failJob on error', async () => {
      const startScope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/start')
        .reply(200, 'OK');

      const failScope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/fail')
        .query({ message: 'Test error' })
        .reply(200, 'OK');

      const wrappedFn = cronradar.wrap('test-job', async () => {
        throw new Error('Test error');
      });

      await expect(wrappedFn()).rejects.toThrow('Test error');
      expect(startScope.isDone()).toBe(true);
      expect(failScope.isDone()).toBe(true);
    });

    it('should pass arguments to wrapped function', async () => {
      nock('https://cron.life').post(/.*/).reply(200).persist();

      const wrappedFn = cronradar.wrap('test-job', async (a, b) => {
        return a + b;
      });

      const result = await wrappedFn(1, 2);

      expect(result).toBe(3);
    });
  });

  describe('syncMonitor()', () => {
    it('should send POST request to /api/sync', async () => {
      const scope = nock('https://cron.life')
        .post('/api/sync', (body) => {
          return body.source && body.monitors && body.monitors.length === 1;
        })
        .reply(200, 'OK');

      await cronradar.syncMonitor('test-job', '* * * * *');

      expect(scope.isDone()).toBe(true);
    });

    it('should include Basic auth header', async () => {
      const scope = nock('https://cron.life')
        .post('/api/sync')
        .matchHeader('Authorization', (val) => val.startsWith('Basic '))
        .reply(200, 'OK');

      await cronradar.syncMonitor('test-job', '* * * * *');

      expect(scope.isDone()).toBe(true);
    });

    it('should send correct payload structure', async () => {
      const scope = nock('https://cron.life')
        .post('/api/sync', (body) => {
          return body.monitors[0].key === 'test-job' &&
                 body.monitors[0].schedule === '*/5 * * * *' &&
                 body.monitors[0].gracePeriod === 60;
        })
        .reply(200, 'OK');

      await cronradar.syncMonitor('test-job', '*/5 * * * *');

      expect(scope.isDone()).toBe(true);
    });

    it('should generate readable name from kebab-case key', async () => {
      const scope = nock('https://cron.life')
        .post('/api/sync', (body) => {
          return body.monitors[0].name === 'Check Overdue Pings';
        })
        .reply(200, 'OK');

      await cronradar.syncMonitor('check-overdue-pings', '* * * * *');

      expect(scope.isDone()).toBe(true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      await expect(cronradar.syncMonitor('test-job', '* * * * *')).resolves.toBeUndefined();
    });
  });
});
