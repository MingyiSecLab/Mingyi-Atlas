import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { responseSummary, scopedFetch, scopeInput } from './api-validation-utils.js';

const oauthInputSchema = z
  .object({
    issuer: z.string().url().optional().describe('OIDC issuer base URL for .well-known/openid-configuration discovery.'),
    authorizationUrl: z.string().url().optional().describe('OAuth/OIDC authorization URL to parse locally.'),
    ...scopeInput,
  })
  .refine(value => value.issuer || value.authorizationUrl, {
    message: 'Provide issuer or authorizationUrl.',
  });

export const oauthValidateTool = createTool({
  id: 'oauth_validate',
  description: `Validate OAuth/OIDC metadata or parse an authorization URL for common configuration risks.

Network discovery is scope-gated. URL parsing is local and does not send requests.`,
  inputSchema: oauthInputSchema,
  execute: async (input, context) => {
    const parsed = oauthInputSchema.parse(input);
    const findings: string[] = [];
    let discovery: unknown;

    if (parsed.authorizationUrl) {
      const authUrl = new URL(parsed.authorizationUrl);
      if (!authUrl.searchParams.get('state')) findings.push('missing_state');
      if (!authUrl.searchParams.get('code_challenge')) findings.push('missing_pkce_code_challenge');
      if (authUrl.searchParams.get('response_type')?.includes('token')) findings.push('implicit_flow_requested');
      if (!authUrl.searchParams.get('redirect_uri')) findings.push('missing_redirect_uri');
    }

    if (parsed.issuer) {
      const discoveryUrl = new URL('/.well-known/openid-configuration', parsed.issuer).toString();
      const result = await scopedFetch(discoveryUrl, { method: 'GET' }, context, parsed.scopeHosts, parsed.timeoutMs);
      if (!result.success) return { ...result, findings };
      try {
        discovery = JSON.parse(result.body);
        const obj = discovery as Record<string, unknown>;
        if (Array.isArray(obj.response_types_supported) && obj.response_types_supported.includes('token')) {
          findings.push('issuer_supports_implicit_flow');
        }
        if (!Array.isArray(obj.code_challenge_methods_supported)) findings.push('pkce_methods_not_advertised');
      } catch {
        return { success: false, error: 'invalid_discovery_json', findings, response: responseSummary(result) };
      }
    }

    return { success: true, findings, discovery };
  },
});
