import { describe, expect, it } from 'vitest';

import { MC_TOOLS } from '../../../../tool-names.js';
import {
  PENTEST_VULN_VALIDATION_TOOLS,
  TOOL_PROFILE_ATTACK_SURFACE,
  TOOL_PROFILE_FINDING_JUDGE,
} from '../shared/toolProfiles.js';
import {
  pentestAttackSurfaceSubagent,
  pentestAuthSubagent,
  pentestFindingJudgeSubagent,
  pentestSpecializedSubagentIds,
  pentestSpecializedSubagents,
  pentestValidationSubagent,
} from '../index.js';

const specializedSubagents = [...pentestSpecializedSubagents];

describe('specialized pentest subagents', () => {
  it('can discover and read workspace skills during their assigned stage', () => {
    for (const subagent of specializedSubagents) {
      expect(subagent.allowedWorkspaceTools).toEqual(
        expect.arrayContaining([MC_TOOLS.SKILL, MC_TOOLS.SKILL_SEARCH, MC_TOOLS.SKILL_READ]),
      );
      expect(subagent.instructions).toContain('skill_search');
      expect(subagent.instructions).toContain('Use skill to activate');
    }
  });

  it('uses focused specialist ids without a supervisor subagent', () => {
    expect(pentestSpecializedSubagentIds).toEqual([
      'attack-surface',
      'auth',
      'validation',
      'finding-judge',
    ]);
    expect(specializedSubagents.map(subagent => subagent.id)).toEqual(pentestSpecializedSubagentIds);
    expect(specializedSubagents.some(subagent => subagent.id.includes('supervisor'))).toBe(false);
  });

  it('lets specialists choose scoped helper tools by responsibility', () => {
    expect(pentestAttackSurfaceSubagent.allowedWorkspaceTools).toEqual(
      expect.arrayContaining([...TOOL_PROFILE_ATTACK_SURFACE]),
    );
    expect(pentestAuthSubagent.allowedWorkspaceTools).toEqual(expect.arrayContaining(['detect_auth_scheme']));
    expect(pentestValidationSubagent.allowedWorkspaceTools).toEqual(
      expect.arrayContaining([...PENTEST_VULN_VALIDATION_TOOLS]),
    );
    expect(pentestFindingJudgeSubagent.allowedWorkspaceTools).toEqual(
      expect.arrayContaining([...TOOL_PROFILE_FINDING_JUDGE]),
    );

    expect(pentestAttackSurfaceSubagent.allowedWorkspaceTools).not.toContain('sqli_probe');
    expect(pentestFindingJudgeSubagent.instructions).toContain('Do not create, edit, delete, or broaden findings');
    expect(pentestValidationSubagent.instructions).toContain('baseline/test/diff');
  });

  it('describes a complete attack surface workflow', () => {
    expect(pentestAttackSurfaceSubagent.instructions).toContain('## Preconditions');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('## Mandatory Workflow');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('For each verified target-owned asset');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('For each verified target-owned endpoint');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('Use **blackbox**');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('Use **whitebox**');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('Use **hybrid**');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('Use record_asset and record_endpoint');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('Use validate_discovery before handoff');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('document the final effective destination');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('Coverage Gaps');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('Handoff Notes');
  });

  it('keeps attack surface guidance aligned with Mingyi Atlas tool names', () => {
    expect(pentestAttackSurfaceSubagent.instructions).toContain('record_asset');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('record_endpoint');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('extract_js_endpoints');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('detect_auth_scheme');
    expect(pentestAttackSurfaceSubagent.instructions).toContain('validate_discovery');

    expect(pentestAttackSurfaceSubagent.instructions).not.toContain('document_app');
    expect(pentestAttackSurfaceSubagent.instructions).not.toContain('document_endpoint');
    expect(pentestAttackSurfaceSubagent.instructions).not.toContain('create_attack_surface_report');
    expect(pentestAttackSurfaceSubagent.instructions).not.toContain('browser_navigate');
  });

  it('keeps auth guidance aligned with Mingyi Atlas tool names', () => {
    expect(pentestAuthSubagent.instructions).toContain('detect_auth_scheme');
    expect(pentestAuthSubagent.instructions).toContain('jwt_analyze');
    expect(pentestAuthSubagent.instructions).toContain('oauth_validate');
    expect(pentestAuthSubagent.instructions).toContain('run_browser_cli');
    expect(pentestAuthSubagent.instructions).toContain('record_endpoint');
    expect(pentestAuthSubagent.instructions).toContain('Input Classification');
    expect(pentestAuthSubagent.instructions).toContain('Map authorization boundaries');

    expect(pentestAuthSubagent.instructions).not.toContain('authenticate_session');
    expect(pentestAuthSubagent.instructions).not.toContain('complete_authentication');
    expect(pentestAuthSubagent.instructions).not.toContain('browser_navigate');
    expect(pentestAuthSubagent.instructions).not.toContain('browser_get_cookies');
  });

  it('gives every specialist an explicit workflow and output contract', () => {
    for (const subagent of specializedSubagents) {
      expect(subagent.instructions).toContain('## Mission');
      expect(subagent.instructions).toContain('## Preconditions');
      expect(subagent.instructions).toContain('## Mandatory Workflow');
      expect(subagent.instructions).toContain('## Tool Rules');
      expect(subagent.instructions).toContain('## Output Contract');
    }
  });

  it('defines domain-specific workflows for core specialists', () => {
    expect(pentestAuthSubagent.instructions).toContain('Identify the authentication surface');
    expect(pentestValidationSubagent.instructions).toContain('Establish a safe baseline');
    expect(pentestFindingJudgeSubagent.instructions).toContain('Evaluate materiality');
  });
});
