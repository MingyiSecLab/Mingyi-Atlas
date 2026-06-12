import { createHash } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const hashAlgorithmSchema = z.enum(['md5', 'sha1', 'sha256', 'sha384', 'sha512']);

const hashAnalyzeInputSchema = z.object({
  action: z.enum(['identify', 'digest']).default('identify'),
  value: z.string().min(1).describe('Hash value to identify, or input data to digest.'),
  algorithm: hashAlgorithmSchema.optional().describe('Required for digest.'),
  inputEncoding: z.enum(['utf8', 'hex', 'base64']).default('utf8').describe('Encoding for digest input data.'),
});

function identifyHash(value: string): Array<{ algorithm: string; confidence: 'high' | 'medium' }> {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  const candidates: Array<{ algorithm: string; confidence: 'high' | 'medium' }> = [];

  if (/^[a-f0-9]{32}$/.test(lower)) candidates.push({ algorithm: 'md5', confidence: 'high' });
  if (/^[a-f0-9]{40}$/.test(lower)) candidates.push({ algorithm: 'sha1', confidence: 'high' });
  if (/^[a-f0-9]{64}$/.test(lower)) candidates.push({ algorithm: 'sha256', confidence: 'high' });
  if (/^[a-f0-9]{96}$/.test(lower)) candidates.push({ algorithm: 'sha384', confidence: 'high' });
  if (/^[a-f0-9]{128}$/.test(lower)) candidates.push({ algorithm: 'sha512', confidence: 'high' });
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(normalized)) candidates.push({ algorithm: 'bcrypt', confidence: 'high' });
  if (/^\$argon2(id|i|d)\$/.test(normalized)) candidates.push({ algorithm: 'argon2', confidence: 'high' });
  if (/^\$pbkdf2(-sha\d+)?\$/i.test(normalized)) candidates.push({ algorithm: 'pbkdf2', confidence: 'medium' });
  if (/^\$[156]\$/.test(normalized)) candidates.push({ algorithm: 'unix-crypt', confidence: 'medium' });

  return candidates;
}

export const hashAnalyzeTool = createTool({
  id: 'hash_analyze',
  description: `Identify common hash formats or compute basic digests offline.

This tool does not crack hashes, perform wordlist attacks, or contact external services.`,
  inputSchema: hashAnalyzeInputSchema,
  execute: async input => {
    const parsed = hashAnalyzeInputSchema.parse(input);
    if (parsed.action === 'identify') {
      return {
        success: true,
        action: parsed.action,
        candidates: identifyHash(parsed.value),
        length: parsed.value.trim().length,
      };
    }

    if (!parsed.algorithm) {
      return { success: false, error: 'missing_algorithm', message: 'algorithm is required for digest.' };
    }

    let data: Buffer;
    try {
      data = Buffer.from(parsed.value, parsed.inputEncoding);
    } catch (error) {
      return { success: false, error: 'invalid_input_encoding', message: error instanceof Error ? error.message : String(error) };
    }

    return {
      success: true,
      action: parsed.action,
      algorithm: parsed.algorithm,
      digest: createHash(parsed.algorithm).update(data).digest('hex'),
    };
  },
});
