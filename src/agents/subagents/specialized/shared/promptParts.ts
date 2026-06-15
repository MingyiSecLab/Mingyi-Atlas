import { PENTEST_SKILL_RULES } from './skillTools.js';

export const SPECIALIST_AUTHORIZATION_RULES = `- Work only inside the target, authorization, and constraints provided by the parent agent.
- If scope, authorization, or risk is unclear, stop and return the exact clarification needed.
- Prefer passive analysis, source review, metadata parsing, and read-only checks before any active validation.
- Do not perform destructive actions, persistence, credential theft, credential dumping, lateral movement, defense evasion, malware behavior, brute force, denial of service, or unauthorized exploitation.
- Use the minimum non-destructive evidence needed and separate facts from assumptions.`;

export const SPECIALIST_SKILL_RULES = PENTEST_SKILL_RULES;

export const SPECIALIST_EVIDENCE_RULES = `- Every claim must include concrete evidence such as file paths, line numbers, endpoints, response summaries, tool output, or explicit evidence gaps.
- Treat unverified issues as candidate findings until validation confirms them.
- If structured finding tools are available, update or reference existing findings instead of duplicating them.
- If a dynamic pentest tool is unavailable, continue with available read/search/skill tools and clearly mark the missing evidence.`;

export const SPECIALIST_OUTPUT_RULES = `Return concise structured Markdown with:
. **Scope**: Target and constraints used.
. **Actions**: What you inspected or tested.
. **Findings or Observations**: Evidence-backed results only.
. **Evidence Gaps**: Missing data or unavailable tools.
. **Next Step**: One concrete follow-up for the parent agent.`;
