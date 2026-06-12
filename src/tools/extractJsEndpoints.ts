import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const endpointPatternSpecs: Array<{ kind: string; method?: string; regex: RegExp }> = [
  { kind: 'fetch', regex: /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'axios', regex: /\baxios\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'axios', method: 'GET', regex: /\baxios\.get\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'axios', method: 'POST', regex: /\baxios\.post\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'axios', method: 'PUT', regex: /\baxios\.put\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'axios', method: 'PATCH', regex: /\baxios\.patch\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'axios', method: 'DELETE', regex: /\baxios\.delete\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'axios_config', regex: /\burl\s*:\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'xhr', regex: /\.open\s*\(\s*['"`]([A-Z]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'jquery_ajax', regex: /\$\.ajax\s*\(\s*\{[\s\S]*?\burl\s*:\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'jquery_get', method: 'GET', regex: /\$\.get\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'jquery_post', method: 'POST', regex: /\$\.post\s*\(\s*['"`]([^'"`]+)['"`]/gi },
  { kind: 'html_form', regex: /<form\b[^>]*\baction\s*=\s*['"]([^'"]+)['"]/gi },
  { kind: 'script_src', method: 'GET', regex: /<script\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi },
  { kind: 'link_href', method: 'GET', regex: /<link\b[^>]*\bhref\s*=\s*['"]([^'"]+)['"]/gi },
];

const likelyEndpointRegex = /(?:^|['"`(=\s])((?:\/api\/|\/v\d+\/|\/graphql\b|\/auth\/|\/oauth\/|\/admin\b|\/login\b|\/logout\b|\/users?\b|\/accounts?\b|\/orders?\b|\/files?\b)[^'"`\s)<]*)/gi;

export const extractJsEndpointsInputSchema = z.object({
  content: z.string().min(1).describe('JavaScript or HTML content to analyze. This tool does not fetch URLs.'),
  sourceUrl: z.string().url().optional().describe('Optional source URL used to resolve relative endpoints.'),
  includeStaticAssets: z.boolean().default(false).describe('Whether to include static .js/.css/image asset references.'),
});

export interface ExtractedEndpoint {
  value: string;
  resolvedUrl?: string;
  kind: string;
  method?: string;
}

function shouldKeepEndpoint(value: string, includeStaticAssets: boolean): boolean {
  if (!value || value.startsWith('#') || value.startsWith('javascript:') || value.startsWith('mailto:')) return false;
  if (includeStaticAssets) return true;
  return !/\.(?:js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|map)(?:[?#].*)?$/i.test(value);
}

function resolveEndpoint(value: string, sourceUrl?: string): string | undefined {
  if (!sourceUrl) return undefined;
  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return undefined;
  }
}

export function extractJsEndpointsFromContent(
  content: string,
  options: { sourceUrl?: string; includeStaticAssets?: boolean } = {},
): ExtractedEndpoint[] {
  const includeStaticAssets = options.includeStaticAssets ?? false;
  const byKey = new Map<string, ExtractedEndpoint>();

  const addEndpoint = (value: string, kind: string, method?: string) => {
    const trimmed = value.trim();
    if (!shouldKeepEndpoint(trimmed, includeStaticAssets)) return;
    const resolvedUrl = resolveEndpoint(trimmed, options.sourceUrl);
    const key = `${method ?? ''}:${resolvedUrl ?? trimmed}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        value: trimmed,
        resolvedUrl,
        kind,
        ...(method ? { method } : {}),
      });
    }
  };

  for (const spec of endpointPatternSpecs) {
    for (const match of content.matchAll(spec.regex)) {
      if (spec.kind === 'xhr') {
        addEndpoint(match[2] ?? '', spec.kind, match[1]);
      } else {
        addEndpoint(match[1] ?? '', spec.kind, spec.method);
      }
    }
  }

  for (const match of content.matchAll(likelyEndpointRegex)) {
    addEndpoint(match[1] ?? '', 'literal');
  }

  return [...byKey.values()].sort((a, b) => (a.resolvedUrl ?? a.value).localeCompare(b.resolvedUrl ?? b.value));
}

export const extractJsEndpointsTool = createTool({
  id: 'extract_js_endpoints',
  description:
    'Extract endpoint paths and URLs from provided JavaScript or HTML content. This is offline analysis and does not make network requests.',
  inputSchema: extractJsEndpointsInputSchema,
  execute: async input => {
    const parsed = extractJsEndpointsInputSchema.parse(input);
    const endpoints = extractJsEndpointsFromContent(parsed.content, {
      sourceUrl: parsed.sourceUrl,
      includeStaticAssets: parsed.includeStaticAssets,
    });
    return {
      count: endpoints.length,
      endpoints,
    };
  },
});
