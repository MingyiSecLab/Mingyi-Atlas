import { describe, expect, it } from 'vitest';

import { stateSchema } from '../schema.js';

describe('stateSchema', () => {
  it('preserves session model and mode ids through parse', () => {
    const parsed = stateSchema.parse({
      currentModelId: 'anthropic/claude-opus-4-8',
      modeId: 'plan',
    });

    expect(parsed.currentModelId).toBe('anthropic/claude-opus-4-8');
    expect(parsed.modeId).toBe('plan');
  });

  it('preserves task ids in harness state', () => {
    const parsed = stateSchema.parse({
      tasks: [
        {
          id: 'tests',
          content: 'Write tests',
          status: 'pending',
          activeForm: 'Writing tests',
        },
      ],
    });

    expect(parsed.tasks).toEqual([
      {
        id: 'tests',
        content: 'Write tests',
        status: 'pending',
        activeForm: 'Writing tests',
      },
    ]);
  });
});
