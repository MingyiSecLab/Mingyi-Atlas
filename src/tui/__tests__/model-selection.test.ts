import { describe, expect, it, vi } from 'vitest';
import { ensureActiveModelSelection, getModeDefaultModelId, getSelectedOrDefaultModelId } from '../model-selection.js';
import type { TUIState } from '../state.js';

function createState(overrides: Partial<TUIState> = {}): TUIState {
  return {
    harness: {
      listModes: vi.fn(() => [
        { id: 'build', default: true, defaultModelId: 'anthropic/claude-opus-4-6' },
        { id: 'pentest', defaultModelId: 'bifrost/gpt-5.4' },
      ]),
      switchModel: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      mode: { get: vi.fn(() => 'pentest') },
      model: { get: vi.fn(() => '') },
    },
    ...overrides,
  } as unknown as TUIState;
}

describe('model-selection', () => {
  it('reads the current mode default model when no explicit selection exists', () => {
    const state = createState();

    expect(getModeDefaultModelId(state)).toBe('bifrost/gpt-5.4');
    expect(getSelectedOrDefaultModelId(state)).toBe('bifrost/gpt-5.4');
  });

  it('prefers the explicit session model over the mode default', () => {
    const state = createState({
      session: {
        mode: { get: vi.fn(() => 'pentest') },
        model: { get: vi.fn(() => 'openai/gpt-5.5') },
      },
    } as unknown as TUIState['session']);

    expect(getSelectedOrDefaultModelId(state)).toBe('openai/gpt-5.5');
  });

  it('switches to the mode default model when no explicit selection exists', async () => {
    const state = createState();

    await expect(ensureActiveModelSelection(state)).resolves.toBe('bifrost/gpt-5.4');
    expect(state.harness.switchModel).toHaveBeenCalledWith({ modelId: 'bifrost/gpt-5.4' });
  });

  it('does not switch model when an explicit selection already exists', async () => {
    const state = createState({
      session: {
        mode: { get: vi.fn(() => 'pentest') },
        model: { get: vi.fn(() => 'openai/gpt-5.5') },
      },
    } as unknown as TUIState['session']);

    await expect(ensureActiveModelSelection(state)).resolves.toBe('openai/gpt-5.5');
    expect(state.harness.switchModel).not.toHaveBeenCalled();
  });
});
