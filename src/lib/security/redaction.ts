export const REDACTED = '[REDACTED]';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'proxy-authorization',
]);

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*["']?[^"',\s&}]+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:\d[ -]*?){13,19}\b/g,
];

export function isSensitiveHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(normalized) || normalized.includes('token') || normalized.includes('secret');
}

export function redactHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, isSensitiveHeader(name) ? REDACTED : redactSecrets(value)]),
  );
}

export function redactCookieHeader(value: string): string {
  return value
    .split(';')
    .map(part => {
      const [name] = part.trim().split('=');
      return name ? `${name}=${REDACTED}` : REDACTED;
    })
    .join('; ');
}

export function redactSecrets(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, match => {
      const separator = match.match(/^([^:=]+[:=]\s*)/);
      if (separator?.[1]) return `${separator[1]}${REDACTED}`;
      if (/^Bearer\s+/i.test(match)) return `Bearer ${REDACTED}`;
      return REDACTED;
    });
  }
  return redacted;
}

export function redactBodySnippet(body: string | undefined, maxLength = 4096): string | undefined {
  if (body === undefined) return undefined;
  const truncated = body.length > maxLength ? `${body.slice(0, maxLength)}...[truncated]` : body;
  return redactSecrets(truncated);
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value, 'http://local.invalid');
    for (const [key] of url.searchParams) {
      if (isSensitiveHeader(key) || /password|secret|token|key/i.test(key)) {
        url.searchParams.set(key, REDACTED);
      }
    }
    const output = url.toString();
    return value.startsWith('http://') || value.startsWith('https://')
      ? output
      : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return redactSecrets(value);
  }
}
