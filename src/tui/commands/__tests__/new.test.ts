import { describe, expect, it, vi } from 'vitest';
import { handleNewCommand } from '../new.js';
import type { SlashCommandContext } from '../types.js';

function createCtx() {
  const displayState = { modifiedFiles: new Set(['src/old.ts']) };
  const state = {
    pendingNewThread: false,
    chatContainer: { clear: vi.fn() },
    pendingTools: new Map([['old-tool', {}]]),
    pendingTaskToolIds: new Set(['old-task-tool']),
    allToolComponents: [{}],
    allSlashCommandComponents: [{}],
    allSystemReminderComponents: [{}],
    messageComponentsById: new Map([['message-1', {}]]),
    allShellComponents: [{}],
    taskToolInsertIndex: 5,
    taskProgress: { updateTasks: vi.fn() },
    session: {
      displayState: { get: vi.fn(() => displayState) },
      state: { set: vi.fn().mockResolvedValue(undefined) },
    },
    harness: {
      detachFromCurrentThread: vi.fn(),
    },
    ui: { requestRender: vi.fn() },
  };
  const ctx = {
    state,
    harness: state.harness,
    updateStatusLine: vi.fn(),
    showInfo: vi.fn(),
  } as unknown as SlashCommandContext;
  return { ctx, state, displayState };
}

describe('handleNewCommand', () => {
  it('detaches from the current thread before starting a pending new thread', async () => {
    const { ctx, state, displayState } = createCtx();
    const callOrder: string[] = [];

    state.harness.detachFromCurrentThread.mockImplementation(() => {
      callOrder.push('detach');
    });
    const originalPendingNewThread = Object.getOwnPropertyDescriptor(state, 'pendingNewThread');
    Object.defineProperty(state, 'pendingNewThread', {
      set(value: boolean) {
        if (value) callOrder.push('pendingNewThread');
        Object.defineProperty(state, 'pendingNewThread', { value, writable: true, configurable: true });
      },
      get() {
        return originalPendingNewThread?.value ?? false;
      },
      configurable: true,
    });

    await handleNewCommand(ctx);

    expect(state.harness.detachFromCurrentThread).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['detach', 'pendingNewThread']);
    expect(state.pendingNewThread).toBe(true);
    expect(state.chatContainer.clear).toHaveBeenCalledTimes(1);
    expect(state.pendingTools.size).toBe(0);
    expect(state.pendingTaskToolIds.size).toBe(0);
    expect(state.allToolComponents).toEqual([]);
    expect(state.allSlashCommandComponents).toEqual([]);
    expect(state.allSystemReminderComponents).toEqual([]);
    expect(state.messageComponentsById.size).toBe(0);
    expect(state.allShellComponents).toEqual([]);
    expect(displayState.modifiedFiles.size).toBe(0);
    expect(state.session.state.set).toHaveBeenCalledWith({ tasks: [], activePlan: null, sandboxAllowedPaths: [] });
    expect(state.taskProgress.updateTasks).toHaveBeenCalledWith([]);
    expect(state.taskToolInsertIndex).toBe(-1);
    expect(ctx.updateStatusLine).toHaveBeenCalledTimes(1);
    expect(state.ui.requestRender).toHaveBeenCalledTimes(1);
    expect(ctx.showInfo).toHaveBeenCalledWith('Ready for new conversation');
  });
});
