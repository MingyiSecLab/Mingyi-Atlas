import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { RequestContext } from '@mastra/core/request-context';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../onboarding/settings.js', () => ({
  loadSettings: () => ({}),
}));
vi.mock('../../onboarding/settings.js', () => ({
  loadSettings: () => ({}),
}));

afterEach(() => {
  vi.resetModules();
});

function createRequestContext(projectPath: string) {
  const requestContext = new RequestContext();
  requestContext.set('harness', {
    modeId: 'build',
    getState: () => ({
      projectPath,
      sandboxAllowedPaths: [],
    }),
  });
  return requestContext;
}

const READONLY = ['view', 'search_content', 'find_files', 'file_stat', 'lsp_inspect'];
const MUTATING = ['write_file', 'string_replace_lsp', 'delete_file', 'mkdir', 'ast_smart_edit', 'execute_command'];

describe('getGoalJudgeTools', () => {
  it('returns only the read-only verification subset of workspace tools', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mingyi-atlas-goal-judge-tools-'));
    try {
      const { getGoalJudgeTools } = await import('../workspace.js');
      const tools = await getGoalJudgeTools({ requestContext: createRequestContext(tempDir) as any });

      expect(tools).toBeDefined();
      const names = Object.keys(tools!);

      for (const name of READONLY) {
        expect(names).toContain(name);
      }
      for (const name of MUTATING) {
        expect(names).not.toContain(name);
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns undefined when no project path can be resolved', async () => {
    const { getGoalJudgeTools } = await import('../workspace.js');
    const requestContext = new RequestContext();
    requestContext.set('harness', { modeId: 'build', getState: () => ({}) });
    const tools = await getGoalJudgeTools({ requestContext: requestContext as any });
    expect(tools).toBeUndefined();
  });
});
