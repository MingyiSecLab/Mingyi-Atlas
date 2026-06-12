import { describe, expect, it } from 'vitest';

import {
  browserCliInputSchema,
  ensureOpenBrowserChannel,
  ensureBrowserOutputFilename,
  normalizeBrowserArgv,
  validateBrowserTargets,
} from '../browserRunner.js';

describe('run_browser_cli helpers', () => {
  it('requires targets to be inside scope', () => {
    expect(validateBrowserTargets(['https://app.example.com'], ['example.com'])).toMatchObject({
      ok: true,
      targetHosts: ['app.example.com'],
    });

    expect(validateBrowserTargets(['https://evil.test'], ['example.com'])).toMatchObject({
      ok: false,
      error: 'scope_violation',
      targetHosts: ['evil.test'],
    });
  });

  it('rejects empty exec argv, unsafe session ids, and path-like output filenames', () => {
    expect(() =>
      browserCliInputSchema.parse({
        sessionId: 'task1',
        argv: [],
        targets: ['https://app.example.com'],
        purpose: 'invalid browser command',
      }),
    ).toThrow();

    expect(() =>
      browserCliInputSchema.parse({
        sessionId: '../../bad',
        argv: ['open', 'https://app.example.com'],
        targets: ['https://app.example.com'],
        purpose: 'invalid session',
      }),
    ).toThrow();

    expect(() =>
      browserCliInputSchema.parse({
        sessionId: 'task1',
        argv: ['open', 'https://app.example.com'],
        targets: ['https://app.example.com'],
        expectedOutputs: ['../screenshot.png'],
        purpose: 'invalid output',
      }),
    ).toThrow();
  });

  it('allows close without argv', () => {
    expect(
      browserCliInputSchema.parse({
        sessionId: 'task1',
        action: 'close',
        purpose: 'close browser task session',
      }),
    ).toMatchObject({ action: 'close', argv: [] });
  });

  it('normalizes JSON argv strings for compatibility', () => {
    expect(normalizeBrowserArgv('["open","https://app.example.com"]')).toMatchObject({
      argv: ['open', 'https://app.example.com'],
    });

    expect(() => normalizeBrowserArgv('open https://app.example.com')).toThrow();
  });

  it('adds chromium browser channel for open when omitted', () => {
    expect(ensureOpenBrowserChannel(['open', 'https://app.example.com'])).toMatchObject({
      argv: ['open', 'https://app.example.com', '--browser=chromium'],
    });

    expect(ensureOpenBrowserChannel(['open', 'https://app.example.com', '--browser=firefox'])).toEqual({
      argv: ['open', 'https://app.example.com', '--browser=firefox'],
    });
  });

  it('adds /out filename for evidence-producing commands', () => {
    const result = ensureBrowserOutputFilename(['screenshot']);
    expect(result.argv).toHaveLength(2);
    expect(result.argv[1]).toMatch(/^--filename=\/out\/.+-screenshot\.png$/);
    expect(result.expectedOutput).toMatch(/-screenshot\.png$/);
    expect(result.warning).toContain('added missing --filename');

    expect(ensureBrowserOutputFilename(['pdf', '--filename=/out/page.pdf'])).toMatchObject({
      argv: ['pdf', '--filename=/out/page.pdf'],
      expectedOutput: 'page.pdf',
    });

    expect(ensureBrowserOutputFilename(['snapshot', '--filename=local.yml']).warning).toContain('outside /out');
  });
});
