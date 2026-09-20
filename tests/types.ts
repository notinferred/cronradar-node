import { wrap, syncMonitors } from '../src';

const job = {
  count: 1,
  run: wrap('typed-job', function(this: { count: number }, increment: number) {
    return this.count + increment;
  }),
};

const result: Promise<number> = job.run(2);
const registry: Promise<void> = syncMonitors([
  { key: 'typed-job', schedule: '0 * * * *', gracePeriod: 600 },
], { source: 'manual', version: '0.1.1' });
void result;
void registry;
