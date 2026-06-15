import type { HarnessSubagent } from '@mastra/core/harness';

import { TOOL_PROFILE_VALIDATION } from '../shared/toolProfiles.js';
import { validationPrompt } from './prompt.js';

export const pentestValidationSubagent: HarnessSubagent = {
  id: 'pentest-validation',
  name: 'Pentest Validation',
  description: 'Performs scoped, non-destructive validation and retest planning for candidate findings.',
  instructions: validationPrompt,
  allowedWorkspaceTools: [...TOOL_PROFILE_VALIDATION],
};
