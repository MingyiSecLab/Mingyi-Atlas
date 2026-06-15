import type { HarnessSubagent } from '@mastra/core/harness';

import { TOOL_PROFILE_ATTACK_SURFACE } from '../shared/toolProfiles.js';
import { attackSurfacePrompt } from './prompt.js';

export const pentestAttackSurfaceSubagent: HarnessSubagent = {
  id: 'pentest-attack-surface',
  name: 'Pentest Attack Surface',
  description: 'Maps authorized assets, routes, APIs, services, trust boundaries, and discovery gaps.',
  instructions: attackSurfacePrompt,
  allowedWorkspaceTools: [...TOOL_PROFILE_ATTACK_SURFACE],
};
