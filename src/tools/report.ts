import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getPentestContextPath, readPentestContext } from '../security/pentest/context.js';
import { getPentestFindingsPath, readPentestFindings } from '../security/pentest/findings.js';
import { pentestReportFormatSchema, writePentestReport } from '../security/pentest/report.js';
import { resolvePentestProjectContext } from './pentest-target.js';

const generateReportInputSchema = z.object({
  title: z.string().min(1).optional(),
  format: pentestReportFormatSchema.default('markdown'),
  outputBaseName: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use only letters, numbers, dots, underscores, and dashes.')
    .optional(),
});

export const generateReportTool = createTool({
  id: 'generate_report',
  description:
    'Generate a pentest report from persisted scope, assets, endpoints, retest queue, and structured findings. Writes Markdown, JSON, or both under the pentest reports directory.',
  inputSchema: generateReportInputSchema,
  execute: async (input, context) => {
    const parsed = generateReportInputSchema.parse(input);
    const { projectRoot, configDir, targetSlug } = resolvePentestProjectContext(context);
    const pentestContext = readPentestContext(getPentestContextPath(projectRoot, configDir, targetSlug));
    const findings = readPentestFindings(getPentestFindingsPath(projectRoot, configDir, targetSlug)).findings;
    const result = writePentestReport({
      projectRoot,
      configDir,
      targetSlug,
      context: pentestContext,
      findings,
      title: parsed.title,
      format: parsed.format,
      outputBaseName: parsed.outputBaseName,
    });

    return {
      success: true,
      markdownPath: result.markdownPath,
      jsonPath: result.jsonPath,
      summary: result.report.summary,
      findingCount: result.report.findings.length,
      message: `Generated pentest report with ${result.report.findings.length} finding(s).`,
    };
  },
});
