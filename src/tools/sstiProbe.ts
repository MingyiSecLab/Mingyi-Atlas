import { createTool } from '@mastra/core/tools';

import { getBaselineAndProbe, paramProbeSchema, responseSummary } from './apiValidationUtils.js';

export const sstiProbeTool = createTool({
  id: 'ssti_probe',
  description: `Run a bounded, non-destructive SSTI marker probe on one URL parameter.

Uses arithmetic template markers and checks for reflected evaluation such as 49. It does not attempt code execution.`,
  inputSchema: paramProbeSchema,
  execute: async (input, context) => {
    const parsed = paramProbeSchema.parse(input);
    const { baseline, probe, probeUrl } = await getBaselineAndProbe(
      parsed.url,
      parsed.parameter,
      '{{7*7}}',
      parsed.headers,
      context,
      parsed.scopeHosts,
      parsed.timeoutMs,
    );
    const evaluated = probe.success ? /\b49\b/.test(probe.body) : false;
    const reflected = probe.success ? probe.body.includes('{{7*7}}') : false;
    return { success: baseline.success && probe.success, baseline: responseSummary(baseline), probe: responseSummary(probe), probeUrl, indicators: { evaluated, reflected } };
  },
});
