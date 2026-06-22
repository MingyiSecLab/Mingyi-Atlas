import type { HarnessSubagent } from '@mastra/core/harness';

import { TOOL_PROFILE_FINDING_JUDGE } from '../shared/toolProfiles.js';
import { findingJudgePrompt } from './prompt.js';

export const pentestFindingJudgeSubagent: HarnessSubagent = {
  id: 'finding-judge',
  name: 'Pentest Finding Judge',
  description: 'Independently reviews candidate finding evidence and rejects unsupported or low-signal claims.',
  instructions: findingJudgePrompt,
  allowedWorkspaceTools: [...TOOL_PROFILE_FINDING_JUDGE],
};
