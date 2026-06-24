import type { TUIState } from './state.js';

function normalizeModelId(modelId: string | undefined | null): string | undefined {
  const trimmed = modelId?.trim();
  return trimmed ? trimmed : undefined;
}

export function getModeDefaultModelId(state: TUIState): string | undefined {
  const modes = state.harness.listModes();
  const currentModeId = state.session.mode.get();
  const currentMode =
    modes.find(mode => mode.id === currentModeId) ?? modes.find(mode => mode.default) ?? modes[0] ?? undefined;
  return normalizeModelId(currentMode?.defaultModelId);
}

export function getSelectedOrDefaultModelId(state: TUIState): string | undefined {
  return normalizeModelId(state.session.model.get()) ?? getModeDefaultModelId(state);
}

export async function ensureActiveModelSelection(state: TUIState): Promise<string | undefined> {
  const selectedModelId = normalizeModelId(state.session.model.get());
  if (selectedModelId) {
    return selectedModelId;
  }

  const fallbackModelId = getModeDefaultModelId(state);
  if (!fallbackModelId) {
    return undefined;
  }

  await state.harness.switchModel({ modelId: fallbackModelId });
  return fallbackModelId;
}
