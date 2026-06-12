import { describe, expect, it } from 'vitest';

import { cryptoAnalyzeTool } from '../cryptoAnalyze.js';
import { hashAnalyzeTool } from '../hashAnalyze.js';

describe('hash and crypto analysis tools', () => {
  it('identifies common hash formats and computes digests offline', async () => {
    const identified = await hashAnalyzeTool.execute(
      {
        action: 'identify',
        value: '5d41402abc4b2a76b9719d911017c592',
      },
      {} as any,
    );

    expect(identified.success).toBe(true);
    expect(identified.candidates).toContainEqual({ algorithm: 'md5', confidence: 'high' });

    const digest = await hashAnalyzeTool.execute(
      {
        action: 'digest',
        algorithm: 'sha256',
        value: 'hello',
      },
      {} as any,
    );

    expect(digest).toMatchObject({
      success: true,
      algorithm: 'sha256',
      digest: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });
  });

  it('detects and converts common encodings offline', async () => {
    const detected = await cryptoAnalyzeTool.execute(
      {
        action: 'detect',
        value: 'aGVsbG8=',
      },
      {} as any,
    );

    expect(detected).toMatchObject({
      success: true,
      indicators: { base64: true },
    });

    const decoded = await cryptoAnalyzeTool.execute(
      {
        action: 'decode',
        format: 'base64',
        value: 'aGVsbG8=',
      },
      {} as any,
    );

    expect(decoded).toMatchObject({
      success: true,
      output: 'hello',
    });
  });
});
