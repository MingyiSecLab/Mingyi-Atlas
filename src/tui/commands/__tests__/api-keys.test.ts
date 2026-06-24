import { describe, expect, it, vi } from 'vitest';

import { getModelProviderId, refreshCurrentModelAfterApiKeyChange } from '../api-keys.js';

describe('api key refresh helpers', () => {
  it('derives the effective provider from direct and mastra-prefixed model ids', () => {
    expect(getModelProviderId('anthropic/claude-sonnet-4-6')).toBe('anthropic');
    expect(getModelProviderId('mastra/openai/gpt-4o')).toBe('openai');
    expect(getModelProviderId('')).toBeUndefined();
  });

  it('reloads the current model when the edited api key matches its provider', async () => {
    const switchModel = vi.fn().mockResolvedValue(undefined);
    const refreshModelAuthStatus = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      state: {
        session: {
          model: {
            get: () => 'mastra/anthropic/claude-sonnet-4-6',
          },
        },
        harness: {
          switchModel,
        },
      },
      refreshModelAuthStatus,
      updateStatusLine: vi.fn(),
      showError: vi.fn(),
    } as any;

    await refreshCurrentModelAfterApiKeyChange(ctx, 'anthropic');

    expect(switchModel).toHaveBeenCalledWith({ modelId: 'mastra/anthropic/claude-sonnet-4-6' });
    expect(refreshModelAuthStatus).toHaveBeenCalled();
    expect(ctx.updateStatusLine).not.toHaveBeenCalled();
    expect(ctx.showError).not.toHaveBeenCalled();
  });

  it('skips refresh when the edited provider does not match the current model', async () => {
    const switchModel = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      state: {
        session: {
          model: {
            get: () => 'openai/gpt-5.4',
          },
        },
        harness: {
          switchModel,
        },
      },
      updateStatusLine: vi.fn(),
      showError: vi.fn(),
    } as any;

    await refreshCurrentModelAfterApiKeyChange(ctx, 'anthropic');

    expect(switchModel).not.toHaveBeenCalled();
    expect(ctx.updateStatusLine).not.toHaveBeenCalled();
    expect(ctx.showError).not.toHaveBeenCalled();
  });
});
