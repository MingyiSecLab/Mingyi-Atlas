import { pentestAttackSurfaceSubagent } from './attackSurface/index.js';
import { pentestAuthSubagent } from './authenticationAgent/index.js';
import { pentestFindingJudgeSubagent } from './findingJudge/index.js';
import { pentestValidationSubagent } from './validation/index.js';

export {
  pentestAttackSurfaceSubagent,
  pentestAuthSubagent,
  pentestFindingJudgeSubagent,
  pentestValidationSubagent,
};

export const pentestSpecializedSubagents = [
  pentestAttackSurfaceSubagent,
  pentestAuthSubagent,
  pentestValidationSubagent,
  pentestFindingJudgeSubagent,
] as const;

export const pentestSpecializedSubagentIds = pentestSpecializedSubagents.map(subagent => subagent.id);
