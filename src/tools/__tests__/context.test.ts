import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPentestTargetSlug } from '../../security/pentest/paths.js';
import { recordScopeTool } from '../context.js';

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('pentest context tools', () => {
  it('records scope in a target-specific bucket and marks that target active', async () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'mingyi-atlas-context-tool-'));
    tempDirs.push(projectPath);
    const setState = vi.fn();
    const target = 'http://34.166.198.47:40015/';
    const targetSlug = getPentestTargetSlug(target);

    const result = await recordScopeTool.execute(
      { target, type: 'url', notes: 'authorized test target' },
      {
        requestContext: {
          get: (key: string) =>
            key === 'harness'
              ? {
                  getState: () => ({ projectPath, configDir: '.mingyi-atlas' }),
                  setState,
                }
              : undefined,
        },
      } as any,
    );

    expect(result.duplicate).toBe(false);
    expect(setState).toHaveBeenCalledWith({ pentestTarget: target, pentestTargetSlug: targetSlug });
    expect(
      existsSync(path.join(projectPath, '.mingyi-atlas', 'pentest', 'targets', targetSlug, 'context.json')),
    ).toBe(true);
  });
});
