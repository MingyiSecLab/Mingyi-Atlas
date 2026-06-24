import type { HarnessMessage, HarnessThread, OMProgressState } from '@mastra/core/harness';
import type { TUIState } from './state.js';

type DisplayStateLike = {
  isRunning?: boolean;
  omProgress?: Partial<OMProgressState>;
  bufferingMessages?: boolean;
  bufferingObservations?: boolean;
  tasks?: unknown[];
  previousTasks?: unknown[];
  modifiedFiles?: unknown;
};

export function getDisplayStateSnapshot(state: TUIState): DisplayStateLike {
  return state.session.displayState.get() as DisplayStateLike;
}

export async function listActiveMessages(state: TUIState, options?: { limit?: number }): Promise<HarnessMessage[]> {
  return state.session.thread.listActiveMessages(options);
}

export async function listThreads(state: TUIState): Promise<HarnessThread[]> {
  return state.session.thread.list();
}

export function getCurrentThreadId(state: TUIState): string | null {
  return state.session.thread.getId() ?? null;
}

export function getCurrentResourceId(state: TUIState): string | undefined {
  return state.session.identity.getResourceId();
}

export function getCurrentModeId(state: TUIState): string | undefined {
  return state.session.mode.get();
}

export function getCurrentModeColor(state: TUIState): string | undefined {
  const sessionColor = state.session.mode.resolve()?.metadata?.color;
  return typeof sessionColor === 'string' ? sessionColor : undefined;
}

export function getQueuedFollowUpCount(state: TUIState): number {
  return state.session.followUps.count();
}

export function isRunActive(state: TUIState): boolean {
  return state.session.run.isRunning();
}
