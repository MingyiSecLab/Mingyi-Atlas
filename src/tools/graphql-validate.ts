import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { isHttpUrl, MAX_QUERY_CHARS, responseSummary, scopedFetch, scopeInput } from './api-validation-utils.js';

const graphqlInputSchema = z.object({
  endpoint: z.string().url().refine(isHttpUrl, 'Endpoint must be http:// or https://.'),
  query: z
    .string()
    .max(MAX_QUERY_CHARS)
    .default('{ __typename }')
    .describe('Read-only GraphQL query. Mutations are rejected.'),
  variables: z.record(z.string(), z.unknown()).default({}),
  headers: z.record(z.string(), z.string()).default({}),
  ...scopeInput,
});

export const graphqlValidateTool = createTool({
  id: 'graphql_validate',
  description: `Run a scoped, read-only GraphQL validation request.

Mutations are rejected. Use for endpoint confirmation, auth boundary checks, harmless introspection probes, and baseline/test comparisons inside approved scope.`,
  inputSchema: graphqlInputSchema,
  execute: async (input, context) => {
    const parsed = graphqlInputSchema.parse(input);
    if (/^\s*mutation\b/i.test(parsed.query)) {
      return { success: false, error: 'mutation_rejected', message: 'graphql_validate only allows read-only queries.' };
    }
    const result = await scopedFetch(
      parsed.endpoint,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...parsed.headers },
        body: JSON.stringify({ query: parsed.query, variables: parsed.variables }),
      },
      context,
      parsed.scopeHosts,
      parsed.timeoutMs,
    );
    if (!result.success) return result;
    let json: unknown;
    try {
      json = JSON.parse(result.body);
    } catch {
      json = undefined;
    }
    return {
      ...responseSummary(result),
      json,
      hasGraphQlErrors:
        typeof json === 'object' && json !== null && Array.isArray((json as Record<string, unknown>).errors),
    };
  },
});
