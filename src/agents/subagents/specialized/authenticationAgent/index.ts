import type { HarnessSubagent } from '@mastra/core/harness';

import { TOOL_PROFILE_AUTH } from '../shared/toolProfiles.js';
import { authPrompt } from './prompt.js';

export const pentestAuthSubagent: HarnessSubagent = {
  id: 'pentest-auth',
  name: 'Pentest Auth',
  description: 'Analyzes authentication schemes, sessions, tokens, OAuth/OIDC, and authorization boundaries.',
  instructions: authPrompt,
  allowedWorkspaceTools: [...TOOL_PROFILE_AUTH],
};
