import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { isHttpUrl, responseSummary, scopedFetch, scopeInput } from './api-validation-utils.js';

const xxeProbeSchema = z.object({
  url: z.string().url().refine(isHttpUrl, 'URL must be http:// or https://.'),
  headers: z.record(z.string(), z.string()).default({}),
  ...scopeInput,
});

export const xxeProbeTool = createTool({
  id: 'xxe_probe',
  description: `Run a bounded, non-destructive XXE reflection probe.

Sends a harmless inline entity marker. It does not reference files, internal services, or external DTDs.`,
  inputSchema: xxeProbeSchema,
  execute: async (input, context) => {
    const parsed = xxeProbeSchema.parse(input);
    const marker = `MINGYI_XXE_${Date.now()}`;
    const body = `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe "${marker}">]><root>&xxe;</root>`;
    const result = await scopedFetch(
      parsed.url,
      { method: 'POST', headers: { 'content-type': 'application/xml', ...parsed.headers }, body },
      context,
      parsed.scopeHosts,
      parsed.timeoutMs,
    );
    return { ...responseSummary(result), markerReflected: result.success ? result.body.includes(marker) : false };
  },
});
