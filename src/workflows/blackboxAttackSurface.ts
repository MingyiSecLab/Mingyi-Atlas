import type { AttackSurfaceItem, AttackSurfaceKind, AttackSurfaceParameter } from '../lib/security/attackSurface.js';
import { pentestAuthContextTool } from '../tools/pentest/authContext.js';
import { assertPentestTargetInScope } from '../tools/pentest/scopeGuard.js';

export interface BlackboxDiscoveredTarget {
  target: string;
  objective?: string;
  method?: string;
  kind?: AttackSurfaceKind;
  businessContext?: string;
  authRequired?: boolean;
  authScheme?: BlackboxAuthScheme;
  sessionEvidenceIds?: string[];
  parameters?: AttackSurfaceParameter[];
  evidence?: string[];
}

export type BlackboxAuthScheme = 'form-login' | 'cookie-session' | 'bearer-token' | 'basic-auth' | 'oauth-redirect' | 'unknown';

export interface BlackboxAuthInput {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  bearerToken?: string;
  username?: string;
  password?: string;
  loginPath?: string;
}

export interface BlackboxAuthCoverage {
  attempted: boolean;
  authenticated: boolean;
  scheme?: BlackboxAuthScheme;
  loginTargets: string[];
  protectedTargets: string[];
  evidenceIds: string[];
  limitations: string[];
}

export interface BlackboxAttackSurfaceResult {
  source: 'blackbox';
  targets: BlackboxDiscoveredTarget[];
  authCoverage?: BlackboxAuthCoverage;
}

export interface BlackboxAttackSurfaceInput {
  target: string;
  blackboxTargets?: BlackboxDiscoveredTarget[];
  fetch?: typeof fetch;
  maxJavaScriptAssets?: number;
  maxAuthenticatedPages?: number;
  artifactDir?: string;
  auth?: BlackboxAuthInput;
}

interface HtmlDiscovery {
  targets: BlackboxDiscoveredTarget[];
  scripts: string[];
}

const DEFAULT_MAX_JS_ASSETS = 8;
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const itemKey = key(item);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    result.push(item);
  }
  return result;
}

function attributeValue(attrs: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = attrs.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function normalizeUrlPath(raw: string, base: URL): string | undefined {
  if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) {
    return undefined;
  }

  try {
    const url = new URL(raw, base);
    if (url.origin !== base.origin) return undefined;
    return `${url.pathname || '/'}${url.search}`;
  } catch {
    return undefined;
  }
}

function inferKind(path: string, method?: string): AttackSurfaceKind {
  const normalized = path.toLowerCase();
  if (normalized.endsWith('.js')) return 'static-js';
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('oauth') || normalized.includes('callback') || normalized.includes('saml') || normalized.includes('sso')) {
    return 'callback';
  }
  if (normalized.includes('login') || normalized.includes('signin') || normalized.includes('session')) return 'auth';
  if (normalized.includes('upload') || normalized.includes('avatar') || normalized.includes('attachment')) return 'upload';
  if (normalized.startsWith('/api/') || normalized.includes('/api/')) return 'api';
  if (method && method.toUpperCase() !== 'GET') return 'form';
  return 'page';
}

export function isAuthSurfacePath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized.includes('login') ||
    normalized.includes('signin') ||
    normalized.includes('register') ||
    normalized.includes('signup') ||
    normalized.includes('password-reset') ||
    normalized.includes('reset-password') ||
    normalized.includes('oauth') ||
    normalized.includes('callback') ||
    normalized.includes('saml') ||
    normalized.includes('sso') ||
    normalized.includes('session')
  );
}

export function inferAuthSchemeFromHtml(html: string, input?: BlackboxAuthInput): BlackboxAuthScheme | undefined {
  if (input?.bearerToken) return 'bearer-token';
  if (input?.cookies && Object.keys(input.cookies).length) return 'cookie-session';
  if (input?.headers?.Authorization?.toLowerCase().startsWith('basic ')) return 'basic-auth';
  if (/oauth|openid|saml|sso/i.test(html)) return 'oauth-redirect';
  if (/<form\b[\s\S]*?(password|passwd)[\s\S]*?<\/form>/i.test(html)) return 'form-login';
  return undefined;
}

function queryParameters(path: string): AttackSurfaceParameter[] {
  const query = path.split('?')[1];
  if (!query) return [];
  const params = new URLSearchParams(query);
  return [...params.entries()].map(([name, example]) => ({ name, location: 'query' as const, example }));
}

function formInputs(innerHtml: string): AttackSurfaceParameter[] {
  const parameters: AttackSurfaceParameter[] = [];
  for (const match of innerHtml.matchAll(/<input\b([^>]*)>/gi)) {
    const name = attributeValue(match[1] ?? '', 'name');
    if (!name) continue;
    parameters.push({ name, location: 'body' });
  }
  for (const match of innerHtml.matchAll(/<(?:textarea|select)\b([^>]*)>/gi)) {
    const name = attributeValue(match[1] ?? '', 'name');
    if (!name) continue;
    parameters.push({ name, location: 'body' });
  }
  return unique(parameters, parameter => `${parameter.location}:${parameter.name}`);
}

export function extractJavaScriptEndpointCandidates(source: string): string[] {
  const candidates: string[] = [];
  const stringPattern = /(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

  for (const match of source.matchAll(stringPattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (!value.startsWith('/') && !isHttpUrl(value)) continue;
    if (value.startsWith('//')) continue;
    if (!/[a-zA-Z0-9]/.test(value)) continue;
    candidates.push(value);
  }

  return unique(candidates, value => value);
}

export function extractBlackboxTargetsFromHtml(html: string, baseTarget: string): HtmlDiscovery {
  const base = new URL(baseTarget);
  const targets: BlackboxDiscoveredTarget[] = [];
  const scripts: string[] = [];

  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attributeValue(match[1] ?? '', 'href');
    const path = href ? normalizeUrlPath(href, base) : undefined;
    if (!path) continue;
    targets.push({
      target: path,
      kind: inferKind(path),
      parameters: queryParameters(path),
      evidence: [`link href="${href}"`],
    });
  }

  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const src = attributeValue(match[1] ?? '', 'src');
    const path = src ? normalizeUrlPath(src, base) : undefined;
    if (!path) continue;
    scripts.push(path);
    targets.push({
      target: path,
      kind: 'static-js',
      evidence: [`script src="${src}"`],
    });
  }

  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = match[1] ?? '';
    const innerHtml = match[2] ?? '';
    const action = attributeValue(attrs, 'action') ?? base.pathname;
    const method = (attributeValue(attrs, 'method') ?? 'GET').toUpperCase();
    const path = normalizeUrlPath(action, base);
    if (!path) continue;
    targets.push({
      target: path,
      method,
      kind: inferKind(path, method),
      parameters: [...queryParameters(path), ...formInputs(innerHtml)],
      evidence: [`form action="${action}" method="${method}"`],
    });
  }

  return {
    targets: unique(targets, target => `${target.method ?? 'GET'}:${target.target}:${target.kind ?? 'page'}`),
    scripts: unique(scripts, script => script),
  };
}

export function normalizeJavaScriptCandidates(candidates: string[], baseTarget: string): BlackboxDiscoveredTarget[] {
  const base = new URL(baseTarget);
  const targets: BlackboxDiscoveredTarget[] = [];

  for (const candidate of candidates) {
    const path = normalizeUrlPath(candidate, base);
    if (!path) continue;
    targets.push({
      target: path,
      kind: inferKind(path),
      parameters: queryParameters(path),
      evidence: [`javascript string "${candidate}"`],
    });
  }

  return unique(targets, target => `${target.target}:${target.kind ?? 'page'}`);
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  return fetchTextWithHeaders(url, fetchImpl);
}

function authHeaders(input?: BlackboxAuthInput): Record<string, string> | undefined {
  if (!input) return undefined;
  const headers = {
    ...input.headers,
    ...(input.bearerToken ? { Authorization: `Bearer ${input.bearerToken}` } : {}),
    ...(input.cookies
      ? {
          Cookie: Object.entries(input.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; '),
        }
      : {}),
  };
  return Object.keys(headers).length ? headers : undefined;
}

async function fetchTextWithHeaders(url: string, fetchImpl: typeof fetch, headers?: Record<string, string>): Promise<string | undefined> {
  try {
    const response = await fetchImpl(url, headers ? { headers } : undefined);
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

function loginTargetsFrom(targets: BlackboxDiscoveredTarget[]): string[] {
  return targets.filter(target => isAuthSurfacePath(target.target)).map(target => target.target);
}

async function writeAuthContextEvidence(input: BlackboxAttackSurfaceInput, scheme?: BlackboxAuthScheme): Promise<string[]> {
  if (!input.artifactDir || !input.auth) return [];
  const base = new URL(input.target);
  const result = (await pentestAuthContextTool.execute?.({
    target: input.target,
    targetId: 'blackbox-auth-discovery',
    artifactDir: input.artifactDir,
    label: `blackbox-auth-discovery-${scheme ?? 'unknown'}`,
    headers: input.auth.headers,
    cookies: input.auth.cookies,
    bearerToken: input.auth.bearerToken,
    scope: {
      targetId: 'blackbox-auth-discovery',
      allowedHosts: [base.host],
      allowedPaths: ['/'],
    },
  } as never, {} as never)) as { evidenceIds?: string[] } | undefined;
  return result?.evidenceIds ?? [];
}

export async function runBlackboxAttackSurfaceDiscovery(
  input: BlackboxAttackSurfaceInput,
): Promise<BlackboxAttackSurfaceResult> {
  if (input.blackboxTargets) {
    return { source: 'blackbox', targets: input.blackboxTargets };
  }

  const fetchImpl = input.fetch ?? globalThis.fetch;
  const html = await fetchText(input.target, fetchImpl);
  const base = new URL(input.target);
  const authScheme = inferAuthSchemeFromHtml(html ?? '', input.auth);
  if (!html) {
    return {
      source: 'blackbox',
      targets: [
        {
          target: new URL(input.target).pathname || '/',
          kind: 'page',
          evidence: ['seed target'],
        },
      ],
      authCoverage: input.auth
        ? {
            attempted: true,
            authenticated: false,
            scheme: authScheme ?? 'unknown',
            loginTargets: [],
            protectedTargets: [],
            evidenceIds: [],
            limitations: ['Unable to fetch seed target before authenticated discovery.'],
          }
        : undefined,
    };
  }

  const htmlDiscovery = extractBlackboxTargetsFromHtml(html, input.target);
  const scriptTargets = htmlDiscovery.scripts.slice(0, input.maxJavaScriptAssets ?? DEFAULT_MAX_JS_ASSETS);
  const jsTargets: BlackboxDiscoveredTarget[] = [];

  for (const script of scriptTargets) {
    const scriptUrl = new URL(script, base).toString();
    const source = await fetchText(scriptUrl, fetchImpl);
    if (!source) continue;
    jsTargets.push(...normalizeJavaScriptCandidates(extractJavaScriptEndpointCandidates(source), input.target));
  }

  const publicTargets = unique([...htmlDiscovery.targets, ...jsTargets], target => `${target.method ?? 'GET'}:${target.target}:${target.kind ?? 'page'}`)
    .map(target => isAuthSurfacePath(target.target) ? { ...target, kind: inferKind(target.target, target.method), authScheme } : target);

  let authCoverage: BlackboxAuthCoverage | undefined;
  let authenticatedTargets: BlackboxDiscoveredTarget[] = [];
  if (input.auth) {
    const evidenceIds = await writeAuthContextEvidence(input, authScheme);
    const limitations: string[] = [];
    let authenticated = false;
    try {
      assertPentestTargetInScope(input.target, [base.host]);
      const authenticatedHtml = await fetchTextWithHeaders(input.target, fetchImpl, authHeaders(input.auth));
      authenticated = Boolean(authenticatedHtml);
      if (authenticatedHtml) {
        const authenticatedDiscovery = extractBlackboxTargetsFromHtml(authenticatedHtml, input.target);
        const boundedTargets = authenticatedDiscovery.targets.slice(0, input.maxAuthenticatedPages ?? 25);
        authenticatedTargets = boundedTargets.map(target => ({
          ...target,
          authRequired: true,
          authScheme: authScheme ?? inferAuthSchemeFromHtml(authenticatedHtml, input.auth) ?? 'unknown',
          sessionEvidenceIds: evidenceIds,
          evidence: [...(target.evidence ?? []), 'authenticated discovery'],
        }));
      } else {
        limitations.push('Authenticated request did not return an explorable response.');
      }
    } catch (error) {
      limitations.push(error instanceof Error ? error.message : String(error));
    }

    authCoverage = {
      attempted: true,
      authenticated,
      scheme: authScheme ?? 'unknown',
      loginTargets: loginTargetsFrom(publicTargets),
      protectedTargets: authenticatedTargets.map(target => target.target),
      evidenceIds,
      limitations,
    };
  }

  return {
    source: 'blackbox',
    targets: unique([...publicTargets, ...authenticatedTargets], target => `${target.method ?? 'GET'}:${target.target}:${target.kind ?? 'page'}:${target.authRequired ? 'auth' : 'public'}`),
    authCoverage,
  };
}
