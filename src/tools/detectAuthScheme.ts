import { performance } from 'node:perf_hooks';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getRecordedScopeHosts, isHostInScope } from './http-request.js';

const MAX_BODY_CHARS = 100_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

export const detectAuthSchemeInputSchema = z.object({
  url: z.string().url().describe('The absolute HTTP or HTTPS URL to analyze.'),
  scopeHosts: z
    .array(z.string().min(1))
    .default([])
    .describe('Optional authorized hostnames for this request. Recorded pentest scope is used automatically.'),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
});

export type AuthSchemeMethod = 'basic' | 'digest' | 'bearer' | 'form' | 'oauth' | 'json' | 'unknown';

export interface AuthSchemeDetection {
  method: AuthSchemeMethod;
  endpoint: string;
  fields?: Record<string, string>;
  csrfRequired?: boolean;
  browserRequired?: boolean;
}

export interface AuthBarrier {
  type: 'captcha' | 'mfa' | 'rate_limit';
  evidence: string;
}

function headerRecord(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function findInputName(body: string, candidates: string[]): string | undefined {
  const pattern = new RegExp(`name=["']?(${candidates.join('|')})["']?`, 'i');
  return body.match(pattern)?.[1];
}

function detectBarriers(bodyLower: string, status: number): AuthBarrier[] {
  const barriers: AuthBarrier[] = [];
  if (/captcha|recaptcha|hcaptcha|g-recaptcha/.test(bodyLower)) {
    barriers.push({ type: 'captcha', evidence: 'CAPTCHA marker found in response body.' });
  }
  if (/\bmfa\b|multi-factor|two-factor|2fa|totp|authenticator/.test(bodyLower)) {
    barriers.push({ type: 'mfa', evidence: 'MFA or two-factor marker found in response body.' });
  }
  if (status === 429 || /rate limit|too many requests|slow down/.test(bodyLower)) {
    barriers.push({ type: 'rate_limit', evidence: `Rate limiting indicated by status/body (${status}).` });
  }
  return barriers;
}

export function analyzeAuthScheme(args: {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}): {
  scheme?: AuthSchemeDetection;
  barriers: AuthBarrier[];
  evidence: string[];
  recommendedNextSteps: string[];
} {
  const bodyLower = args.body.toLowerCase();
  const headersLower = Object.fromEntries(Object.entries(args.headers).map(([key, value]) => [key.toLowerCase(), value]));
  const barriers = detectBarriers(bodyLower, args.status);
  const evidence: string[] = [`HTTP status ${args.status}`];
  const recommendedNextSteps: string[] = [];

  const wwwAuth = headersLower['www-authenticate'];
  if (wwwAuth) {
    evidence.push(`WWW-Authenticate: ${wwwAuth}`);
    const lower = wwwAuth.toLowerCase();
    if (lower.includes('basic')) {
      return {
        scheme: { method: 'basic', endpoint: args.url },
        barriers,
        evidence,
        recommendedNextSteps: ['Confirm authorized credentials before testing authenticated endpoints.'],
      };
    }
    if (lower.includes('digest')) {
      return {
        scheme: { method: 'digest', endpoint: args.url },
        barriers,
        evidence,
        recommendedNextSteps: ['Confirm authorized credentials before testing authenticated endpoints.'],
      };
    }
    if (lower.includes('bearer')) {
      return {
        scheme: { method: 'bearer', endpoint: args.url },
        barriers,
        evidence,
        recommendedNextSteps: ['Identify authorized token source and validate token handling non-destructively.'],
      };
    }
  }

  if (args.status >= 300 && args.status < 400) {
    const location = headersLower['location'] ?? '';
    evidence.push(`Redirect Location: ${location || '(none)'}`);
    if (/login|signin|auth|oauth|sso/i.test(location)) {
      return {
        scheme: {
          method: /oauth|sso|openid/i.test(location) ? 'oauth' : 'form',
          endpoint: location || args.url,
          browserRequired: true,
        },
        barriers,
        evidence,
        recommendedNextSteps: ['Use browser automation or inspect the redirected login flow inside scope.'],
      };
    }
  }

  if (/type=["']password["']/.test(bodyLower)) {
    const usernameField = findInputName(args.body, ['username', 'user', 'email', 'login', 'user_name']);
    const passwordField = findInputName(args.body, ['password', 'pass', 'passwd']);
    const csrfField = findInputName(args.body, ['csrf', '_csrf', 'csrfmiddlewaretoken', '_token', 'authenticity_token']);
    const isSpa = /__next|react|angular|vue|svelte|vite/.test(bodyLower);
    evidence.push('Password input found in response body.');
    if (csrfField) evidence.push(`CSRF-like field found: ${csrfField}`);

    return {
      scheme: {
        method: 'form',
        endpoint: args.url,
        fields: {
          ...(usernameField ? { usernameField } : {}),
          ...(passwordField ? { passwordField } : {}),
          ...(csrfField ? { csrfField } : {}),
        },
        csrfRequired: !!csrfField,
        browserRequired: isSpa,
      },
      barriers,
      evidence,
      recommendedNextSteps: ['Use authorized credentials only; preserve CSRF/session handling during validation.'],
    };
  }

  if (/oauth|openid|response_type=["']?code|client_id=|\/authorize\b/.test(bodyLower)) {
    evidence.push('OAuth/OIDC marker found in response body.');
    return {
      scheme: { method: 'oauth', endpoint: args.url, browserRequired: true },
      barriers,
      evidence,
      recommendedNextSteps: ['Map the OAuth/OIDC authorization flow and callback routes inside scope.'],
    };
  }

  const contentType = headersLower['content-type'] ?? '';
  if ((args.status === 401 || args.status === 403) && /json|problem\+json/.test(contentType)) {
    evidence.push(`JSON auth-like response: ${contentType}`);
    return {
      scheme: { method: 'json', endpoint: args.url },
      barriers,
      evidence,
      recommendedNextSteps: ['Inspect API login/token endpoints and authorization boundaries.'],
    };
  }

  return {
    scheme: args.status === 401 || args.status === 403 ? { method: 'unknown', endpoint: args.url } : undefined,
    barriers,
    evidence,
    recommendedNextSteps:
      args.status === 401 || args.status === 403
        ? ['Auth is likely required, but the scheme was not identifiable from this response.']
        : ['No clear auth scheme detected from this endpoint. Continue passive route and frontend analysis.'],
  };
}

export const detectAuthSchemeTool = createTool({
  id: 'detect_auth_scheme',
  description:
    'Detect the likely authentication scheme for a scoped endpoint using a single non-destructive GET request.',
  inputSchema: detectAuthSchemeInputSchema,
  execute: async (input, context) => {
    const parsed = detectAuthSchemeInputSchema.parse(input);
    const target = new URL(parsed.url);
    const recordedScopeHosts = getRecordedScopeHosts(context);
    const effectiveScopeHosts = [...new Set([...recordedScopeHosts, ...parsed.scopeHosts])];

    if (!isHostInScope(target.hostname, effectiveScopeHosts)) {
      return {
        success: false,
        error: 'scope_violation',
        message:
          effectiveScopeHosts.length === 0
            ? `External host "${target.hostname}" requires recorded scope or explicit scopeHosts.`
            : `Host "${target.hostname}" is outside recorded scope/scopeHosts: ${effectiveScopeHosts.join(', ')}`,
        url: parsed.url,
        scopeHosts: effectiveScopeHosts,
      };
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), parsed.timeoutMs);
    const start = performance.now();

    try {
      const response = await fetch(parsed.url, {
        method: 'GET',
        redirect: 'manual',
        signal: timeoutController.signal,
      });
      clearTimeout(timeout);

      let body = await response.text();
      if (body.length > MAX_BODY_CHARS) {
        body = body.slice(0, MAX_BODY_CHARS);
      }
      const headers = headerRecord(response);
      const analysis = analyzeAuthScheme({
        url: parsed.url,
        status: response.status,
        headers,
        body,
      });

      return {
        success: true,
        url: parsed.url,
        status: response.status,
        headers,
        ...analysis,
        elapsedMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      clearTimeout(timeout);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      return {
        success: false,
        error: isAbort ? 'timeout' : 'request_failed',
        message: isAbort ? `Request timed out after ${parsed.timeoutMs}ms.` : error instanceof Error ? error.message : String(error),
        url: parsed.url,
        elapsedMs: Math.round(performance.now() - start),
      };
    }
  },
});
