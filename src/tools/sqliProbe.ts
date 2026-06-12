import { createTool } from '@mastra/core/tools';

import { getBaselineAndProbe, paramProbeSchema, responseSummary } from './apiValidationUtils.js';

export const sqliProbeTool = createTool({
  id: 'sqli_probe',
  description: `Run a bounded, non-destructive SQL injection indicator probe on one URL parameter.

Uses a single quote marker and compares baseline/probe responses. It does not dump data, use sqlmap, or perform time-based testing.`,
  inputSchema: paramProbeSchema,
  execute: async (input, context) => {
    const parsed = paramProbeSchema.parse(input);
    const { baseline, probe, probeUrl } = await getBaselineAndProbe(
      parsed.url,
      parsed.parameter,
      "'",
      parsed.headers,
      context,
      parsed.scopeHosts,
      parsed.timeoutMs,
    );
    const sqlError = probe.success
      ? /(sql syntax|mysql|postgres|sqlite|ora-\d+|odbc|jdbc|unterminated|syntax error)/i.test(probe.body)
      : false;
    return { success: baseline.success && probe.success, baseline: responseSummary(baseline), probe: responseSummary(probe), probeUrl, indicators: { sqlError } };
  },
});
