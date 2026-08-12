import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null
});

export const uptimeQueue = new Queue('uptime-queue', { connection });

export async function addCheckJob(target) {
  await uptimeQueue.add('check-target', target, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false
  });
}