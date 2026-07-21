/**
 * CronRadar Node.js SDK Tests
 */

const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');
const nock = require('nock');
const cronradar = require('../src/index');

describe('CronRadar Node.js SDK', () => {
  const originalEnv = process.env.CRONRADAR_API_KEY;
  let originalConsoleError;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = () => {};
    // Set up test API key
    process.env.CRONRADAR_API_KEY = 'test-api-key-123';
    // Clean up any pending nock mocks
    nock.cleanAll();
  });

  afterEach(() => {
    console.error = originalConsoleError;
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

      assert.equal(scope.isDone(), true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      assert.equal(await cronradar.monitor('test-job'), undefined);
    });

    it('should URL encode special characters in monitor key', async () => {
      const scope = nock('https://cron.life')
        .get('/ping/test%20job%2Fspecial/test-api-key-123')
        .reply(200, 'OK');

      await cronradar.monitor('test job/special');

      assert.equal(scope.isDone(), true);
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

      assert.equal(pingScope.isDone(), true);
      assert.equal(syncScope.isDone(), true);
      assert.equal(retryScope.isDone(), true);
    });

    it('should not trigger sync on 404 without schedule', async () => {
      const pingScope = nock('https://cron.life')
        .get('/ping/test-job/test-api-key-123')
        .reply(404);

      await cronradar.monitor('test-job');

      assert.equal(pingScope.isDone(), true);
    });

    it('should handle network errors gracefully', async () => {
      nock('https://cron.life')
        .get('/ping/test-job/test-api-key-123')
        .replyWithError('Connection refused');

      assert.equal(await cronradar.monitor('test-job'), undefined);
    });
  });

  describe('startJob()', () => {
    it('should send POST request to start endpoint', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/start')
        .reply(200, 'OK');

      await cronradar.startJob('test-job');

      assert.equal(scope.isDone(), true);
    });

    it('should include schedule query param when provided', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/start')
        .query({ schedule: '*/5 * * * *' })
        .reply(200, 'OK');

      await cronradar.startJob('test-job', { schedule: '*/5 * * * *' });

      assert.equal(scope.isDone(), true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      assert.equal(await cronradar.startJob('test-job'), undefined);
    });
  });

  describe('completeJob()', () => {
    it('should send POST request to complete endpoint', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/complete')
        .reply(200, 'OK');

      await cronradar.completeJob('test-job');

      assert.equal(scope.isDone(), true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      assert.equal(await cronradar.completeJob('test-job'), undefined);
    });
  });

  describe('failJob()', () => {
    it('should send POST request to fail endpoint', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/fail')
        .reply(200, 'OK');

      await cronradar.failJob('test-job');

      assert.equal(scope.isDone(), true);
    });

    it('should include message query param when provided', async () => {
      const scope = nock('https://cron.life')
        .post('/ping/test-job/test-api-key-123/fail')
        .query({ message: 'Job failed due to timeout' })
        .reply(200, 'OK');

      await cronradar.failJob('test-job', 'Job failed due to timeout');

      assert.equal(scope.isDone(), true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      assert.equal(await cronradar.failJob('test-job', 'error'), undefined);
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

      assert.equal(result, 'result');
      assert.equal(startScope.isDone(), true);
      assert.equal(completeScope.isDone(), true);
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

      await assert.rejects(wrappedFn(), /Test error/);
      assert.equal(startScope.isDone(), true);
      assert.equal(failScope.isDone(), true);
    });

    it('should pass arguments to wrapped function', async () => {
      nock('https://cron.life').post(/.*/).reply(200).persist();

      const wrappedFn = cronradar.wrap('test-job', async (a, b) => {
        return a + b;
      });

      const result = await wrappedFn(1, 2);

      assert.equal(result, 3);
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

      assert.equal(scope.isDone(), true);
    });

    it('should include Basic auth header', async () => {
      const scope = nock('https://cron.life')
        .post('/api/sync')
        .matchHeader('Authorization', (val) => val.startsWith('Basic '))
        .reply(200, 'OK');

      await cronradar.syncMonitor('test-job', '* * * * *');

      assert.equal(scope.isDone(), true);
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

      assert.equal(scope.isDone(), true);
    });

    it('should generate readable name from kebab-case key', async () => {
      const scope = nock('https://cron.life')
        .post('/api/sync', (body) => {
          return body.monitors[0].name === 'Check Overdue Pings';
        })
        .reply(200, 'OK');

      await cronradar.syncMonitor('check-overdue-pings', '* * * * *');

      assert.equal(scope.isDone(), true);
    });

    it('should not throw when API key is missing', async () => {
      delete process.env.CRONRADAR_API_KEY;

      assert.equal(await cronradar.syncMonitor('test-job', '* * * * *'), undefined);
    });
  });
});
