import { describe, expect, it } from 'vitest';
import { REDACTED, redactBodySnippet, redactHeaders, redactUrl } from './redaction.js';

describe('security redaction', () => {
  it('redacts sensitive headers while preserving ordinary headers', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer secret-token',
        Cookie: 'sid=abc',
        'Content-Type': 'application/json',
        'X-Trace-Id': 'trace-1',
      }),
    ).toEqual({
      Authorization: REDACTED,
      Cookie: REDACTED,
      'Content-Type': 'application/json',
      'X-Trace-Id': 'trace-1',
    });
  });

  it('redacts common secret patterns in body snippets', () => {
    expect(redactBodySnippet('email=user@example.com&access_token=abc123&password=hunter2')).toBe(
      `email=${REDACTED}&access_token=${REDACTED}&password=${REDACTED}`,
    );
  });

  it('redacts sensitive query parameters in URLs', () => {
    expect(redactUrl('https://shop.example/callback?code=ok&access_token=abc123')).toBe(
      `https://shop.example/callback?code=ok&access_token=${encodeURIComponent(REDACTED)}`,
    );
  });
});
