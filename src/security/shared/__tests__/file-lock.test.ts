import { describe, expect, it } from 'vitest';

import { withSecurityFileQueue } from '../file-lock.js';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('withSecurityFileQueue', () => {
  it('serializes operations for the same file path', async () => {
    const events: string[] = [];
    await Promise.all([
      withSecurityFileQueue('/tmp/context.json', async () => {
        events.push('first:start');
        await delay(10);
        events.push('first:end');
      }),
      withSecurityFileQueue('/tmp/context.json', async () => {
        events.push('second:start');
        events.push('second:end');
      }),
    ]);

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });
});
