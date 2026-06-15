import { MC_TOOLS } from '../../../../tool-names.js';

export const PENTEST_SKILL_TOOLS = [MC_TOOLS.SKILL, MC_TOOLS.SKILL_SEARCH, MC_TOOLS.SKILL_READ] as const;

export const PENTEST_SKILL_RULES = `- When skill_search is available, search for relevant pentest skills at the start of the stage.
- Prefer workflow or methodology skills first when they match the assigned stage; use them as operating rules while the agent/subagent remains responsible for decisions.
- Use skill to activate the most relevant skill instructions before deep work.
- Use skill_read for referenced skill files when the activated skill points to supporting material.
- If the parent agent provides activated skill guidance, treat it as task context and do not re-litigate the workflow selection unless it is clearly mismatched.`;
