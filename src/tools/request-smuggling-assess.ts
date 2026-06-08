import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { isHttpUrl, scopedFetch, scopeInput } from './api-validation-utils.js';

const smugglingAssessSchema = z.object({
  url: z.string().url().refine(isHttpUrl, 'URL must be http:// or https://.'),
  responseHeaders: z.record(z.string(), z.string()).optional().describe('Optional already-collected response headers to assess passively.'),
  ...scopeInput,
});

export const requestSmugglingAssessTool = createTool({
  id: 'request_smuggling_assess',
  description: `Passively assess request-smuggling risk signals for a scoped URL.

This tool does not send malformed TE/CL payloads. It performs one normal request or analyzes supplied headers for proxy/backend indicators.`,
  inputSchema: smugglingAssessSchema,
  execute: async (input, context) => {
    const parsed = smugglingAssessSchema.parse(input);
    let headers = parsed.responseHeaders;
    let status: number | undefined;
    if (!headers) {
      const result = await scopedFetch(parsed.url, { method: 'GET' }, context, parsed.scopeHosts, parsed.timeoutMs);
      if (!result.success) return result;
      headers = result.headers;
      status = result.status;
    }
    const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    const indicators: string[] = [];
    if (lower.via || lower['x-cache'] || lower['x-forwarded-server']) indicators.push('proxy_header_present');
    if (lower.server && /nginx|apache|envoy|haproxy|cloudflare|varnish/i.test(lower.server)) indicators.push('known_proxy_or_frontend_server');
    if (lower['transfer-encoding'] && lower['content-length']) indicators.push('response_has_te_and_cl');
    return { success: true, status, headers, indicators, activeSmugglingPayloadsSent: false };
  },
});
