import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchChangelog, parseChangelog } from '../update-check.js';

const SAMPLE_CHANGELOG = [
  '# mingyi-atlas',
  '',
  '## 0.16.0',
  '',
  '### Minor Changes',
  '',
  '- Added evals system for MingyiAtlas. ([#15642](https://github.com/mastra-ai/mastra/pull/15642))',
  '',
  '### Patch Changes',
  '',
  '- Fixed task lists leaking across threads. ([#15749](https://github.com/mastra-ai/mastra/pull/15749))',
  '',
  '- Allow typing a custom model string in `/om`. ([#15703](https://github.com/mastra-ai/mastra/pull/15703))',
  '',
  '- Updated dependencies [[`28caa5b`](https://github.com/mastra-ai/mastra/commit/28caa5b)]:',
  '  - @mastra/core@1.29.0',
  '  - @mastra/memory@1.17.2',
  '',
  '## 0.15.2',
  '',
  '### Patch Changes',
  '',
  '- Old bugfix from previous release. ([#15500](https://github.com/mastra-ai/mastra/pull/15500))',
].join('\n');

describe('parseChangelog', () => {
  it('produces the expected exact output for the sample changelog', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '0.16.0');
    expect(result).toBe(
      [
        '  • Added evals system for MingyiAtlas',
        '  • Fixed task lists leaking across threads',
        '  • Allow typing a custom model string in `/om`',
      ].join('\n'),
    );
  });

  it('does not include entries from other versions', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '0.16.0');
    expect(result).not.toContain('Old bugfix');
  });

  it('filters out dependency update entries and their sub-items', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '0.16.0');
    expect(result).not.toContain('Updated dependenc');
    expect(result).not.toContain('@mastra/core');
    expect(result).not.toContain('@mastra/memory');
  });

  it('strips markdown link syntax', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '0.16.0')!;
    expect(result).not.toMatch(/\[.*\]\(.*\)/);
  });

  it('strips PR reference numbers', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '0.16.0')!;
    expect(result).not.toMatch(/#\d{4,}/);
  });

  it('formats entries as bullet points', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '0.16.0')!;
    const lines = result.split('\n');
    for (const line of lines) {
      expect(line).toMatch(/^\s+•\s+/);
    }
  });

  it('returns null for a version not in the changelog', () => {
    expect(parseChangelog(SAMPLE_CHANGELOG, '99.0.0')).toBeNull();
  });

  it('returns null when there are no meaningful entries', () => {
    const depOnly = ['## 1.0.0', '', '### Patch Changes', '', '- Updated dependencies:', '  - @mastra/core@2.0.0'].join(
      '\n',
    );
    expect(parseChangelog(depOnly, '1.0.0')).toBeNull();
  });

  it('preserves full entry text without truncation', () => {
    const longEntry = 'A'.repeat(200);
    const md = `## 1.0.0\n\n- ${longEntry}`;
    const result = parseChangelog(md, '1.0.0')!;
    expect(result).toContain('A'.repeat(200));
  });

  it('preserves full multi-sentence entries', () => {
    const md = '## 1.0.0\n\n- First sentence here. Then a longer explanation follows with details.';
    const result = parseChangelog(md, '1.0.0')!;
    expect(result).toContain('First sentence here. Then a longer explanation follows with details');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchChangelog', () => {
  it('fetches and parses a published changelog response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(SAMPLE_CHANGELOG, { status: 200 })),
    );

    const result = await fetchChangelog('0.16.0');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');

    const lines = result!.split('\n');
    expect(lines.length).toBeGreaterThan(0);
    // Every line should be a bullet point
    for (const line of lines) {
      expect(line).toMatch(/^\s+•\s+/);
    }
    // Should contain at least one recognizable entry from v0.16.0
    expect(result).toContain('evals');
  });

  it('fetches and preserves full entries for a version with many entries', async () => {
    const changelog = [
      '## 0.10.0',
      '',
      '- Custom response one',
      '- /thread command two',
      '- observational memory three',
      '- Fourth entry',
      '- Fifth entry',
      '- Sixth entry',
      '- Seventh entry',
      '- Eighth entry',
      '- Ninth entry',
      '- Tenth entry',
    ].join('\n');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(changelog, { status: 200 })),
    );

    const result = await fetchChangelog('0.10.0');
    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(9);
    // Entries should not be truncated with "…"
    expect(result).toContain('Custom response');
    expect(result).toContain('/thread command');
    expect(result).toContain('observational memory');
    for (const line of lines) {
      expect(line).toMatch(/^\s+•\s+/);
    }
  });

  it('returns null for a non-existent version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );

    const result = await fetchChangelog('0.0.0-does-not-exist');
    expect(result).toBeNull();
  });
});
