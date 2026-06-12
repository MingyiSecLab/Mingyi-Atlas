import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getBaselineAndProbe, isHttpUrl, paramProbeSchema, rejectOutOfScope, responseSummary } from './apiValidationUtils.js';

const ssrfProbeSchema = paramProbeSchema.extend({
  probeUrl: z.string().url().refine(isHttpUrl, 'probeUrl must be http:// or https://.'),
});

export const ssrfProbeTool = createTool({
  id: 'ssrf_probe',
  description: `Run a bounded SSRF indicator probe by injecting one authorized benign probe URL into one parameter.

Both the target URL host and the injected probe URL host must be in scope. Link-local metadata and localhost probe URLs are rejected.`,
  inputSchema: ssrfProbeSchema,
  execute: async (input, context) => {
    const parsed = ssrfProbeSchema.parse(input);
    const probe = new URL(parsed.probeUrl);
    if (probe.hostname === 'localhost' || probe.hostname === '127.0.0.1' || probe.hostname === '::1' || probe.hostname === '169.254.169.254') {
      return { success: false, error: 'unsafe_probe_url', message: 'Localhost and metadata probe URLs are not allowed.' };
    }
    const probeScopeError = rejectOutOfScope(parsed.probeUrl, context, parsed.scopeHosts);
    if (probeScopeError) return probeScopeError;
    const result = await getBaselineAndProbe(
      parsed.url,
      parsed.parameter,
      parsed.probeUrl,
      parsed.headers,
      context,
      parsed.scopeHosts,
      parsed.timeoutMs,
    );
    return {
      success: result.baseline.success && result.probe.success,
      baseline: responseSummary(result.baseline),
      probe: responseSummary(result.probe),
      probeUrl: result.probeUrl,
      indicators: {
        statusChanged:
          result.baseline.success && result.probe.success ? result.baseline.status !== result.probe.status : false,
      },
    };
  },
});
