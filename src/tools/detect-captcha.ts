import { performance } from 'node:perf_hooks';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getRecordedScopeHosts, isHostInScope } from './http-request.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_BODY_CHARS = 150_000;

export const detectCaptchaInputSchema = z.object({
  url: z.string().url().describe('The absolute HTTP or HTTPS login page URL to analyze.'),
  scopeHosts: z
    .array(z.string().min(1))
    .default([])
    .describe('Optional authorized hostnames for this request. Recorded pentest scope is used automatically.'),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
});

export type CaptchaProvider =
  | 'recaptcha'
  | 'hcaptcha'
  | 'turnstile'
  | 'geetest'
  | 'arkose'
  | 'friendly-captcha'
  | 'tencent-captcha'
  | 'aliyun-captcha'
  | 'datadome'
  | 'aws-waf-captcha'
  | 'image-captcha'
  | 'generic-captcha';

export interface CaptchaSignal {
  provider: CaptchaProvider;
  evidence: string;
  weight: number;
}

export interface CaptchaAnalysis {
  captchaDetected: boolean;
  confidence: 'none' | 'low' | 'medium' | 'high';
  providers: CaptchaProvider[];
  signals: CaptchaSignal[];
  loginSignals: string[];
  manualEntry: CaptchaManualEntry;
  recommendedNextSteps: string[];
}

export interface CaptchaInputCandidate {
  selector: string;
  name?: string;
  id?: string;
  type?: string;
  placeholder?: string;
  label?: string;
  confidence: 'low' | 'medium' | 'high';
  evidence: string;
}

export interface CaptchaChallengeCandidate {
  kind: 'image' | 'provider-widget' | 'text';
  selector?: string;
  provider?: CaptchaProvider;
  src?: string;
  alt?: string;
  evidence: string;
}

export interface CaptchaSubmitCandidate {
  selector: string;
  type?: string;
  text?: string;
  value?: string;
  evidence: string;
}

export interface CaptchaFormCandidate {
  selector: string;
  action?: string;
  method?: string;
  evidence: string;
}

export interface CaptchaManualEntry {
  supported: boolean;
  reason: string;
  inputCandidates: CaptchaInputCandidate[];
  challengeCandidates: CaptchaChallengeCandidate[];
  submitCandidates: CaptchaSubmitCandidate[];
  formCandidates: CaptchaFormCandidate[];
  instructions: string[];
}

function headerRecord(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function snippet(body: string, index: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(body.length, index + 120);
  return body.slice(start, end).replace(/\s+/g, ' ').trim();
}

function addSignal(signals: CaptchaSignal[], body: string, provider: CaptchaProvider, pattern: RegExp, weight: number): void {
  const match = pattern.exec(body);
  if (!match || match.index === undefined) return;
  signals.push({
    provider,
    evidence: snippet(body, match.index),
    weight,
  });
}

function detectLoginSignals(body: string): string[] {
  const signals: string[] = [];
  if (/<form\b/i.test(body)) signals.push('HTML form element present');
  if (/<input[^>]+type=["']?password/i.test(body)) signals.push('password input present');
  if (/<input[^>]+name=["']?(user(name)?|email|login|account)/i.test(body)) signals.push('username/email input present');
  if (/login|sign\s*in|log\s*in|authenticate/i.test(body)) signals.push('login wording present');
  return [...new Set(signals)];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(attrPattern)) {
    const [, rawKey, doubleQuoted, singleQuoted, bare] = match;
    if (!rawKey || rawKey.startsWith('<')) continue;
    attrs[rawKey.toLowerCase()] = decodeHtml(doubleQuoted ?? singleQuoted ?? bare ?? '');
  }
  return attrs;
}

function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function selectorFor(tagName: string, attrs: Record<string, string>, fallbackIndex: number): string {
  if (attrs.id) return `#${attrs.id}`;
  if (attrs.name) return `${tagName}[name="${cssString(attrs.name)}"]`;
  if (attrs.class) return `${tagName}.${attrs.class.trim().split(/\s+/).join('.')}`;
  return `${tagName}:nth-of-type(${fallbackIndex + 1})`;
}

function resolveMaybeUrl(value: string | undefined, baseUrl?: string): string | undefined {
  if (!value) return undefined;
  if (!baseUrl) return value;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function extractLabel(body: string, attrs: Record<string, string>): string | undefined {
  if (attrs.id) {
    const escapedId = attrs.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelFor = new RegExp(`<label\\b[^>]*for=["']?${escapedId}["']?[^>]*>([\\s\\S]{0,120}?)<\\/label>`, 'i');
    const match = labelFor.exec(body);
    if (match?.[1]) return match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return undefined;
}

function captchaFieldConfidence(attrs: Record<string, string>, label: string | undefined): CaptchaInputCandidate['confidence'] {
  const text = `${attrs.name ?? ''} ${attrs.id ?? ''} ${attrs.placeholder ?? ''} ${attrs['aria-label'] ?? ''} ${label ?? ''}`;
  if (/captcha|verifycode|verification[_-]?code|randcode|校验码|验证码/i.test(text)) return 'high';
  if (/\b(code|security)\b/i.test(text)) return 'medium';
  return 'low';
}

function findInputCandidates(body: string): CaptchaInputCandidate[] {
  const candidates: CaptchaInputCandidate[] = [];
  const inputPattern = /<input\b[^>]*>/gi;
  let index = 0;
  for (const match of body.matchAll(inputPattern)) {
    const tag = match[0];
    const attrs = parseAttrs(tag);
    const label = extractLabel(body, attrs);
    const combined = `${attrs.name ?? ''} ${attrs.id ?? ''} ${attrs.type ?? ''} ${attrs.placeholder ?? ''} ${attrs['aria-label'] ?? ''} ${label ?? ''}`;
    if (!/captcha|verifycode|verification[_-]?code|randcode|security\s*code|\bcode\b|校验码|验证码|g-recaptcha-response|h-captcha-response|cf-turnstile-response/i.test(combined)) {
      index += 1;
      continue;
    }
    const type = attrs.type?.toLowerCase();
    if (type && ['hidden', 'submit', 'button', 'checkbox', 'radio', 'password'].includes(type) && !/captcha-response|turnstile-response/i.test(combined)) {
      index += 1;
      continue;
    }
    candidates.push({
      selector: selectorFor('input', attrs, index),
      name: attrs.name,
      id: attrs.id,
      type: attrs.type,
      placeholder: attrs.placeholder,
      label,
      confidence: captchaFieldConfidence(attrs, label),
      evidence: snippet(body, match.index ?? 0),
    });
    index += 1;
  }
  return candidates;
}

function findChallengeCandidates(body: string, providers: CaptchaProvider[], baseUrl?: string): CaptchaChallengeCandidate[] {
  const candidates: CaptchaChallengeCandidate[] = [];
  const imagePattern = /<img\b[^>]*>/gi;
  let imageIndex = 0;
  for (const match of body.matchAll(imagePattern)) {
    const tag = match[0];
    const attrs = parseAttrs(tag);
    const combined = `${attrs.src ?? ''} ${attrs.alt ?? ''} ${attrs.id ?? ''} ${attrs.class ?? ''}`;
    if (/captcha|verifycode|verification|randcode|校验码|验证码/i.test(combined)) {
      candidates.push({
        kind: 'image',
        selector: selectorFor('img', attrs, imageIndex),
        src: resolveMaybeUrl(attrs.src, baseUrl),
        alt: attrs.alt,
        evidence: snippet(body, match.index ?? 0),
      });
    }
    imageIndex += 1;
  }

  const providerSelectors: Array<[CaptchaProvider, RegExp, string]> = [
    ['recaptcha', /<[^>]+(?:g-recaptcha|grecaptcha)[^>]*>/gi, '.g-recaptcha'],
    ['hcaptcha', /<[^>]+(?:h-captcha|hcaptcha)[^>]*>/gi, '.h-captcha'],
    ['turnstile', /<[^>]+(?:cf-turnstile|turnstile)[^>]*>/gi, '.cf-turnstile'],
    ['friendly-captcha', /<[^>]+(?:frc-captcha|friendly-challenge)[^>]*>/gi, '.frc-captcha'],
  ];
  for (const [provider, pattern, fallbackSelector] of providerSelectors) {
    if (!providers.includes(provider)) continue;
    const match = pattern.exec(body);
    if (!match) continue;
    const attrs = parseAttrs(match[0]);
    candidates.push({
      kind: 'provider-widget',
      selector: attrs.id ? `#${attrs.id}` : attrs.class ? selectorFor('div', attrs, 0) : fallbackSelector,
      provider,
      evidence: snippet(body, match.index),
    });
  }

  const textPattern = /(验证码|校验码|captcha|security code|verification code)[^<]{0,120}/i;
  const textMatch = textPattern.exec(body);
  if (textMatch?.index !== undefined) {
    candidates.push({
      kind: 'text',
      evidence: snippet(body, textMatch.index),
    });
  }

  return candidates;
}

function findSubmitCandidates(body: string): CaptchaSubmitCandidate[] {
  const candidates: CaptchaSubmitCandidate[] = [];
  const inputPattern = /<input\b[^>]*>/gi;
  let inputIndex = 0;
  for (const match of body.matchAll(inputPattern)) {
    const attrs = parseAttrs(match[0]);
    const type = attrs.type?.toLowerCase();
    if (type !== 'submit' && type !== 'button') {
      inputIndex += 1;
      continue;
    }
    candidates.push({
      selector: selectorFor('input', attrs, inputIndex),
      type,
      value: attrs.value,
      evidence: snippet(body, match.index ?? 0),
    });
    inputIndex += 1;
  }

  const buttonPattern = /<button\b[^>]*>([\s\S]{0,120}?)<\/button>/gi;
  let buttonIndex = 0;
  for (const match of body.matchAll(buttonPattern)) {
    const attrs = parseAttrs(match[0]);
    const text = (match[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/login|sign\s*in|submit|verify|验证|登录|提交/i.test(`${text} ${attrs.name ?? ''} ${attrs.id ?? ''} ${attrs.class ?? ''}`)) {
      buttonIndex += 1;
      continue;
    }
    candidates.push({
      selector: selectorFor('button', attrs, buttonIndex),
      type: attrs.type,
      text,
      evidence: snippet(body, match.index ?? 0),
    });
    buttonIndex += 1;
  }
  return candidates;
}

function findFormCandidates(body: string, baseUrl?: string): CaptchaFormCandidate[] {
  const candidates: CaptchaFormCandidate[] = [];
  const formPattern = /<form\b[^>]*>/gi;
  let index = 0;
  for (const match of body.matchAll(formPattern)) {
    const attrs = parseAttrs(match[0]);
    candidates.push({
      selector: selectorFor('form', attrs, index),
      action: resolveMaybeUrl(attrs.action, baseUrl),
      method: attrs.method?.toUpperCase() || 'GET',
      evidence: snippet(body, match.index ?? 0),
    });
    index += 1;
  }
  return candidates;
}

function buildManualEntry(body: string, providers: CaptchaProvider[], confidence: CaptchaAnalysis['confidence'], baseUrl?: string): CaptchaManualEntry {
  const inputCandidates = findInputCandidates(body);
  const challengeCandidates = findChallengeCandidates(body, providers, baseUrl);
  const submitCandidates = findSubmitCandidates(body);
  const formCandidates = findFormCandidates(body, baseUrl);
  const supported = confidence !== 'none' && inputCandidates.length > 0;

  return {
    supported,
    reason: supported
      ? 'CAPTCHA input candidates were found for human-provided answers or staging bypass tokens.'
      : confidence === 'none'
        ? 'No CAPTCHA was detected.'
        : 'CAPTCHA was detected, but no direct text input field was found; it may require browser rendering or manual provider interaction.',
    inputCandidates,
    challengeCandidates,
    submitCandidates,
    formCandidates,
    instructions: supported
      ? [
          'Use browser automation to render the page and show the challenge to the operator.',
          'Accept only an operator-provided CAPTCHA answer or an approved staging bypass token.',
          'Fill the selected input candidate and submit the detected form/control in the same browser session.',
        ]
      : ['Use browser automation to inspect the rendered DOM and complete provider challenges manually if authorized.'],
  };
}

function confidenceFromWeight(totalWeight: number): CaptchaAnalysis['confidence'] {
  if (totalWeight >= 5) return 'high';
  if (totalWeight >= 2) return 'medium';
  if (totalWeight > 0) return 'low';
  return 'none';
}

export function analyzeCaptcha(body: string, headers: Record<string, string> = {}, baseUrl?: string): CaptchaAnalysis {
  const limitedBody = body.slice(0, MAX_BODY_CHARS);
  const bodyLower = limitedBody.toLowerCase();
  const headerText = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
    .toLowerCase();
  const combined = `${bodyLower}\n${headerText}`;

  const signals: CaptchaSignal[] = [];
  addSignal(signals, combined, 'recaptcha', /g-recaptcha|recaptcha\/api\.js|www\.google\.com\/recaptcha|grecaptcha/i, 5);
  addSignal(signals, combined, 'hcaptcha', /h-captcha|hcaptcha\.com\/1\/api\.js|js\.hcaptcha\.com/i, 5);
  addSignal(signals, combined, 'turnstile', /cf-turnstile|challenges\.cloudflare\.com\/turnstile|turnstile\.render/i, 5);
  addSignal(signals, combined, 'geetest', /geetest|gt_captcha|captcha\.geetest\.com/i, 5);
  addSignal(signals, combined, 'arkose', /arkoselabs|funcaptcha|fc-token|client-api\.arkoselabs/i, 5);
  addSignal(signals, combined, 'friendly-captcha', /friendlycaptcha|frc-captcha|friendly-challenge/i, 5);
  addSignal(signals, combined, 'tencent-captcha', /tencentcaptcha|captcha\.qq\.com|tcaptcha/i, 5);
  addSignal(signals, combined, 'aliyun-captcha', /aliyun.*captcha|awscaptcha|nc_token|aliyuncs\.com.*captcha/i, 5);
  addSignal(signals, combined, 'datadome', /datadome|ddcaptcha|geo\.captcha-delivery\.com/i, 5);
  addSignal(signals, combined, 'aws-waf-captcha', /awswaf|aws-waf-token|captcha.*aws/i, 5);
  addSignal(
    signals,
    combined,
    'image-captcha',
    /<img[^>]+(?:captcha|verifycode|verification|randcode)|<input[^>]+name=["']?(?:captcha|verifycode|verification_code|code)/i,
    4,
  );
  addSignal(signals, combined, 'generic-captcha', /\bcaptcha\b|验证码|校验码|verification code|security code/i, 2);

  const providers = [...new Set(signals.map(signal => signal.provider))];
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const confidence = confidenceFromWeight(totalWeight);
  const loginSignals = detectLoginSignals(limitedBody);
  const manualEntry = buildManualEntry(limitedBody, providers, confidence, baseUrl);

  return {
    captchaDetected: confidence !== 'none',
    confidence,
    providers,
    signals,
    loginSignals,
    manualEntry,
    recommendedNextSteps:
      confidence === 'none'
        ? ['If the page is JavaScript-rendered, re-check with browser automation and inspect post-rendered DOM.']
        : [
            'Treat CAPTCHA as an automation barrier; do not solve, bypass, or brute-force it automatically.',
            'If testing requires login, collect an operator-provided answer or staging bypass token and use the manualEntry selectors in the same browser session.',
            'Use browser automation to confirm whether the CAPTCHA renders after JavaScript execution.',
            'Document provider, trigger conditions, and whether a test/staging bypass token exists for authorized testing.',
          ],
  };
}

export const detectCaptchaTool = createTool({
  id: 'detect_captcha',
  description:
    'Detect whether an authorized login page appears to use CAPTCHA or bot-challenge controls. Identifies common providers and static image-captcha signals; does not solve or bypass CAPTCHA.',
  inputSchema: detectCaptchaInputSchema,
  execute: async (input, context) => {
    const parsed = detectCaptchaInputSchema.parse(input);
    const target = new URL(parsed.url);
    const recordedScopeHosts = getRecordedScopeHosts(context, [parsed.url]);
    const effectiveScopeHosts = [...new Set([...recordedScopeHosts, ...parsed.scopeHosts])];

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return { success: false, error: 'unsupported_protocol', message: `Unsupported protocol: ${target.protocol}` };
    }

    if (!isHostInScope(target.hostname, effectiveScopeHosts)) {
      return {
        success: false,
        error: 'scope_violation',
        message: `Refusing to request out-of-scope host: ${target.hostname}`,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), parsed.timeoutMs);
    const start = performance.now();

    try {
      const response = await fetch(parsed.url, {
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const headers = headerRecord(response);
      const body = (await response.text()).slice(0, MAX_BODY_CHARS);
      const analysis = analyzeCaptcha(body, headers, parsed.url);

      return {
        success: true,
        url: parsed.url,
        status: response.status,
        statusText: response.statusText,
        elapsedMs: Math.round(performance.now() - start),
        ...analysis,
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
