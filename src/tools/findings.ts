import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import {
  getPentestFinding,
  getPentestFindingsPath,
  listPentestFindings,
  pentestFindingInputSchema,
  pentestFindingStatusSchema,
  pentestFindingUpdateSchema,
  pentestSeveritySchema,
  pentestValidationStatusSchema,
  reportPentestFindingQueued,
  updatePentestFindingQueued,
} from '../security/pentest/findings.js';
import { resolvePentestProjectContext } from './pentest-target.js';

function resolveFindingsPath(context: any, targets: Array<string | undefined> = []): string {
  const { projectRoot, configDir, targetSlug } = resolvePentestProjectContext(context, targets);
  return getPentestFindingsPath(projectRoot, configDir, targetSlug);
}

export const reportFindingTool = createTool({
  id: 'report_finding',
  description:
    'Record a structured pentest finding. Reuses an existing finding when the endpoint/vector, file/line/category, or evidence fingerprint matches.',
  inputSchema: pentestFindingInputSchema,
  execute: async (input, context) => {
    const parsed = pentestFindingInputSchema.parse(input);
    const result = await reportPentestFindingQueued(resolveFindingsPath(context), parsed);
    return {
      duplicate: result.duplicate,
      finding: result.finding,
    };
  },
});

export const listFindingsTool = createTool({
  id: 'list_findings',
  description: 'List structured pentest findings, optionally filtered by severity, validation status, or status.',
  inputSchema: z.object({
    severity: pentestSeveritySchema.optional(),
    validationStatus: pentestValidationStatusSchema.optional(),
    status: pentestFindingStatusSchema.optional(),
  }),
  execute: async (input, context) => {
    const findings = listPentestFindings(resolveFindingsPath(context), input);
    return {
      count: findings.length,
      findings,
    };
  },
});

export const getFindingTool = createTool({
  id: 'get_finding',
  description: 'Get one structured pentest finding by ID.',
  inputSchema: z.object({
    id: z.string().min(1),
  }),
  execute: async ({ id }, context) => {
    const finding = getPentestFinding(resolveFindingsPath(context), id);
    if (!finding) {
      return {
        found: false,
        error: `Pentest finding not found: ${id}`,
      };
    }
    return {
      found: true,
      finding,
    };
  },
});

export const updateFindingTool = createTool({
  id: 'update_finding',
  description:
    'Update a structured pentest finding by ID. Use after validation, remediation, retesting, or severity/status changes.',
  inputSchema: pentestFindingUpdateSchema,
  execute: async (input, context) => {
    const finding = await updatePentestFindingQueued(resolveFindingsPath(context), input);
    return {
      finding,
    };
  },
});

export function createFindingTools() {
  return {
    report_finding: reportFindingTool,
    list_findings: listFindingsTool,
    get_finding: getFindingTool,
    update_finding: updateFindingTool,
  };
}
