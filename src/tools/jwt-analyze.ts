import { createHmac } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

function decodeBase64UrlJson(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export const jwtAnalyzeTool = createTool({
  id: 'jwt_analyze',
  description: `Decode and analyze a JWT offline for auth validation.

This tool does not brute force secrets or generate forged tokens. It reports header/claim risks and can optionally verify an HMAC signature when the tester already has an authorized shared secret.`,
  inputSchema: z.object({
    token: z.string().min(1).describe('JWT token to decode and analyze.'),
    hmacSecret: z.string().optional().describe('Optional authorized HS* secret for signature verification only.'),
  }),
  execute: async input => {
    const parsed = z.object({ token: z.string().min(1), hmacSecret: z.string().optional() }).parse(input);
    const parts = parsed.token.split('.');
    if (parts.length !== 3) {
      return { success: false, error: 'invalid_jwt', message: 'Expected a compact JWT with three dot-separated parts.' };
    }

    try {
      const header = decodeBase64UrlJson(parts[0]);
      const payload = decodeBase64UrlJson(parts[1]);
      const headerObj = typeof header === 'object' && header !== null ? (header as Record<string, unknown>) : {};
      const payloadObj = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const alg = String(headerObj.alg ?? '');
      const now = Math.floor(Date.now() / 1000);
      const issues: string[] = [];

      if (!alg) issues.push('missing_alg');
      if (alg.toLowerCase() === 'none') issues.push('alg_none');
      if (!('exp' in payloadObj)) issues.push('missing_exp');
      if (typeof payloadObj.exp === 'number' && payloadObj.exp < now) issues.push('expired');
      if (typeof payloadObj.exp === 'number' && payloadObj.exp > now + 60 * 60 * 24 * 365) issues.push('long_lived_exp');
      if (!('iat' in payloadObj)) issues.push('missing_iat');

      let hmacVerified: boolean | undefined;
      if (parsed.hmacSecret) {
        const hashByAlg: Record<string, string> = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };
        const hash = hashByAlg[alg];
        if (!hash) {
          issues.push('hmac_secret_supplied_for_non_hmac_alg');
        } else {
          const signed = `${parts[0]}.${parts[1]}`;
          const expected = createHmac(hash, parsed.hmacSecret).update(signed).digest('base64url');
          hmacVerified = expected === parts[2];
        }
      }

      return { success: true, header, payload, issues, hmacVerified };
    } catch (error) {
      return { success: false, error: 'decode_failed', message: error instanceof Error ? error.message : String(error) };
    }
  },
});
