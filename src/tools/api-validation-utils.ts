import { performance } from 'node:perf_hooks';
import { z } from 'zod';

import { getRecordedScopeHosts, isHostInScope } from './http-request.js';

export const DEFAULT_TIMEOUT_MS = 8_000;
export const MAX_TIMEOUT_MS = 20_000;
export const MAX_BODY_CHARS = 12_000;
export const MAX_QUERY_CHARS = 8_000;
export const MAX_MESSAGE_CHARS = 2_000;

export const scopeInput = {
  scopeHosts: z
    .array(z.string().min(1))
    .default([])
    .describe('Authorized hostnames copied from the user-approved scope. Localhost is allowed without this.'),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
};

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\*\./, '');
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

function effectiveScopeHosts(context: any, targets: string[], scopeHosts: string[]): string[] {
  return [...new Set([...getRecordedScopeHosts(context, targets), ...scopeHosts.map(normalizeHost)])];
}

export function rejectOutOfScope(urlValue: string, context: any, scopeHosts: string[]) {
  const url = new URL(urlValue);
  const hosts = effectiveScopeHosts(context, [urlValue], scopeHosts);
  if (!isHostInScope(url.hostname, hosts)) {
    return {
      success: false as const,
      error: 'scope_violation',
      message:
        hosts.length === 0
          ? `External host "${url.hostname}" requires recorded scope or explicit scopeHosts.`
          : `Host "${url.hostname}" is outside recorded scope/scopeHosts: ${hosts.join(', ')}`,
      url: urlValue,
      scopeHosts: hosts,
    };
  }
  return undefined;
}

export async function scopedFetch(
  url: string,
  init: RequestInit,
  context: any,
  scopeHosts: string[],
  timeoutMs: number,
): Promise<
  | { success: false; error: string; message: string; url: string; scopeHosts?: string[]; elapsedMs?: number }
  | { success: true; status: number; headers: Record<string, string>; body: string; elapsedMs: number; finalUrl: string }
> {
  const scopeError = rejectOutOfScope(url, context, scopeHosts);
  if (scopeError) return scopeError;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const body = (await response.text()).slice(0, MAX_BODY_CHARS);
    return {
      success: true,
      status: response.status,
      headers,
      body,
      finalUrl: response.url,
      elapsedMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    clearTimeout(timeout);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return {
      success: false,
      error: isAbort ? 'timeout' : 'request_failed',
      message: isAbort ? `Request timed out after ${timeoutMs}ms.` : error instanceof Error ? error.message : String(error),
      url,
      elapsedMs: Math.round(performance.now() - start),
    };
  }
}

export function responseSummary(result: Awaited<ReturnType<typeof scopedFetch>>) {
  if (!result.success) return result;
  return {
    success: true,
    status: result.status,
    elapsedMs: result.elapsedMs,
    bodyLength: result.body.length,
    bodySample: result.body.slice(0, 800),
    headers: result.headers,
  };
}

export const paramProbeSchema = z.object({
  url: z.string().url().refine(isHttpUrl, 'URL must be http:// or https://.'),
  parameter: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
  ...scopeInput,
});

export async function getBaselineAndProbe(
  urlValue: string,
  parameter: string,
  payload: string,
  headers: Record<string, string>,
  context: any,
  scopeHosts: string[],
  timeoutMs: number,
) {
  const url = new URL(urlValue);
  const baseline = await scopedFetch(url.toString(), { method: 'GET', headers }, context, scopeHosts, timeoutMs);
  const original = url.searchParams.get(parameter) ?? '';
  url.searchParams.set(parameter, `${original}${payload}`);
  const probe = await scopedFetch(url.toString(), { method: 'GET', headers }, context, scopeHosts, timeoutMs);
  return { baseline, probe, probeUrl: url.toString() };
}
