import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const MAX_INPUT_CHARS = 50_000;
const MAX_OUTPUT_CHARS = 20_000;

const cryptoAnalyzeInputSchema = z.object({
  action: z.enum(['detect', 'encode', 'decode']).default('detect'),
  value: z.string().max(MAX_INPUT_CHARS).describe('Text to inspect, encode, or decode.'),
  format: z.enum(['base64', 'base64url', 'hex', 'url']).optional().describe('Required for encode/decode.'),
});

function looksBase64(value: string): boolean {
  const normalized = value.trim();
  return normalized.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

function looksBase64Url(value: string): boolean {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]+$/.test(normalized) && normalized.length > 8;
}

function looksHex(value: string): boolean {
  const normalized = value.trim();
  return normalized.length % 2 === 0 && /^[a-fA-F0-9]+$/.test(normalized);
}

function decodeValue(value: string, format: 'base64' | 'base64url' | 'hex' | 'url'): string {
  if (format === 'url') return decodeURIComponent(value);
  if (format === 'base64url') return Buffer.from(value, 'base64url').toString('utf8');
  return Buffer.from(value, format).toString('utf8');
}

function encodeValue(value: string, format: 'base64' | 'base64url' | 'hex' | 'url'): string {
  if (format === 'url') return encodeURIComponent(value);
  return Buffer.from(value, 'utf8').toString(format);
}

function truncate(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_OUTPUT_CHARS) return { value, truncated: false };
  return { value: value.slice(0, MAX_OUTPUT_CHARS), truncated: true };
}

export const cryptoAnalyzeTool = createTool({
  id: 'crypto_analyze',
  description: `Detect and perform basic offline encoding/decoding for common formats.

Supports base64, base64url, hex, and URL encoding. This tool does not crack encryption, brute force keys, or call external services.`,
  inputSchema: cryptoAnalyzeInputSchema,
  execute: async input => {
    const parsed = cryptoAnalyzeInputSchema.parse(input);

    if (parsed.action === 'detect') {
      return {
        success: true,
        indicators: {
          base64: looksBase64(parsed.value),
          base64url: looksBase64Url(parsed.value),
          hex: looksHex(parsed.value),
          urlEncoded: /%[0-9a-fA-F]{2}/.test(parsed.value),
        },
        length: parsed.value.length,
      };
    }

    if (!parsed.format) {
      return { success: false, error: 'missing_format', message: 'format is required for encode/decode.' };
    }

    try {
      const result = parsed.action === 'encode' ? encodeValue(parsed.value, parsed.format) : decodeValue(parsed.value, parsed.format);
      const output = truncate(result);
      return {
        success: true,
        action: parsed.action,
        format: parsed.format,
        output: output.value,
        outputTruncated: output.truncated,
      };
    } catch (error) {
      return { success: false, error: 'conversion_failed', message: error instanceof Error ? error.message : String(error) };
    }
  },
});
