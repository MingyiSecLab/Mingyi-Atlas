import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getPentestContextPath, readPentestContext } from '../security/pentest/context.js';
import { getPentestFindingsPath } from '../security/pentest/findings.js';
import { resolvePentestProjectContext } from './pentest-target.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BODY_BYTES = 5_000;
const MAX_INLINE_BODY_BYTES = 25_000;

const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);

export const httpRequestInputSchema = z.object({
  url: z.string().url().describe('The absolute HTTP or HTTPS URL to request.'),
  method: httpMethodSchema.default('GET'),
  headers: z.record(z.string(), z.string()).default({}).describe('HTTP request headers.'),
  body: z.string().optional().describe('Request body for POST, PUT, PATCH, or DELETE requests.'),
  followRedirects: z
    .boolean()
    .default(false)
    .describe('Whether to follow redirects. Defaults to false so Location and Set-Cookie are visible.'),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
  maxBodyBytes: z.number().int().positive().max(MAX_INLINE_BODY_BYTES).default(DEFAULT_MAX_BODY_BYTES),
  scopeHosts: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Authorized hostnames for this request, copied from the user-approved test scope. Localhost is allowed without this.',
    ),
  purpose: z.string().min(1).describe('Concise reason for the request, e.g. "baseline login response".'),
});

export type HttpRequestInput = z.input<typeof httpRequestInputSchema>;

function isLocalhost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\*\./, '');
}

export function isHostInScope(hostname: string, scopeHosts: string[]): boolean {
  if (isLocalhost(hostname)) return true;
  const host = normalizeHost(hostname);
  return scopeHosts.some(scopeHost => {
    const allowed = normalizeHost(scopeHost);
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

function scopeTargetToHost(target: string): string | undefined {
  const trimmed = target.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).hostname;
  } catch {
    return trimmed.includes('/') ? undefined : trimmed;
  }
}

export function scopeTargetsToHosts(targets: string[]): string[] {
  return [...new Set(targets.map(scopeTargetToHost).filter((host): host is string => !!host).map(normalizeHost))];
}

export function getRecordedScopeHosts(context: any, targets: Array<string | undefined> = []): string[] {
  const { projectRoot, configDir, targetSlug } = resolvePentestProjectContext(context, targets);
  const contextPath = getPentestContextPath(projectRoot, configDir, targetSlug);
  try {
    const pentestContext = readPentestContext(contextPath);
    return scopeTargetsToHosts(pentestContext.scope.map(item => item.target));
  } catch {
    return [];
  }
}

function resolveHttpResponseLogDir(context: any, target?: string): string {
  const { projectRoot, configDir, targetSlug } = resolvePentestProjectContext(context, [target]);
  return path.join(path.dirname(getPentestFindingsPath(projectRoot, configDir, targetSlug)), 'http-responses');
}

function maybePersistBody(body: string, maxBodyBytes: number, context: any, target?: string): { body: string; bodyFile?: string } {
  if (Buffer.byteLength(body, 'utf-8') <= maxBodyBytes) {
    return { body };
  }

  const logDir = resolveHttpResponseLogDir(context, target);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bodyFile = path.join(logDir, `response-${timestamp}-${hash}.txt`);
  writeFileSync(bodyFile, body, 'utf-8');

  let bytes = 0;
  let truncated = '';
  for (const char of body) {
    const charBytes = Buffer.byteLength(char, 'utf-8');
    if (bytes + charBytes > maxBodyBytes) break;
    truncated += char;
    bytes += charBytes;
  }

  return {
    body: `${truncated}\n\n[truncated: full response saved to ${bodyFile}]`,
    bodyFile,
  };
}

export const httpRequestTool = createTool({
  id: 'http_request',
  description: `Make a scoped HTTP request for authorized, non-destructive pentest validation.

Use when browser automation is unavailable or unnecessary, especially for APIs, headers, redirects, cookies, CORS checks, auth baseline/test comparisons, and simple endpoint validation.

Safety rules:
- Only request URLs inside the user-authorized scope.
- External hosts must be listed in scopeHosts. Localhost is allowed for local app testing.
- Do not use for destructive actions, brute force, denial of service, or exploit chains.
- Large response bodies are saved under .mingyi-atlas/pentest/targets/<target>/http-responses and summarized inline.`,
  inputSchema: httpRequestInputSchema,
  execute: async (input, context) => {
    const parsed = httpRequestInputSchema.parse(input);
    const target = new URL(parsed.url);
    const recordedScopeHosts = getRecordedScopeHosts(context, [parsed.url]);
    const effectiveScopeHosts = [...new Set([...recordedScopeHosts, ...parsed.scopeHosts.map(normalizeHost)])];

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return {
        success: false,
        error: 'unsupported_protocol',
        message: 'Only http:// and https:// URLs are supported.',
        url: parsed.url,
      };
    }

    if (!isHostInScope(target.hostname, effectiveScopeHosts)) {
      return {
        success: false,
        error: 'scope_violation',
        message:
          effectiveScopeHosts.length === 0
            ? `External host "${target.hostname}" requires recorded scope or explicit scopeHosts from the user-approved scope.`
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
        method: parsed.method,
        headers: parsed.headers,
        body: parsed.body,
        redirect: parsed.followRedirects ? 'follow' : 'manual',
        signal: timeoutController.signal,
      });
      clearTimeout(timeout);

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const rawBody = parsed.method === 'HEAD' ? '' : await response.text();
      const persisted = maybePersistBody(rawBody, parsed.maxBodyBytes, context, parsed.url);

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers,
        body: persisted.body,
        bodyFile: persisted.bodyFile,
        bodyTruncated: !!persisted.bodyFile,
        url: parsed.url,
        finalUrl: response.url,
        method: parsed.method,
        redirected: response.redirected,
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
        method: parsed.method,
        elapsedMs: Math.round(performance.now() - start),
      };
    }
  },
});
