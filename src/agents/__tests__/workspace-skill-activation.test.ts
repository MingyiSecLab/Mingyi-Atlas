import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Agent } from '@mastra/core/agent';
import { SkillSearchProcessor } from '@mastra/core/processors';
import { RequestContext } from '@mastra/core/request-context';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();

function toStream(chunks: any[]) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

afterEach(async () => {
  process.chdir(originalCwd);
  vi.resetModules();
});

describe('mastracode workspace skill activation', () => {
  it('loads built-in pentest skills from packages/skills', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mastracode-built-in-skill-'));

    try {
      process.chdir(tempDir);
      const { getDynamicWorkspace } = await import('../workspace.js');

      const requestContext = new RequestContext();
      requestContext.set('harness', {
        modeId: 'pentest',
        getState: () => ({
          projectPath: tempDir,
          sandboxAllowedPaths: [],
        }),
      });

      const workspace = getDynamicWorkspace({ requestContext });
      const skill = await workspace.skills?.get('pentest-ssti');

      expect(skill?.name).toBe('pentest-ssti');
      expect(skill?.description).toContain('server-side template injection');
      expect(skill?.instructions).toContain('# Pentest SSTI');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('loads built-in SSTI skill through direct skill hint fallback', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mastracode-built-in-skill-hint-'));

    try {
      process.chdir(tempDir);
      const { getDynamicWorkspace } = await import('../workspace.js');

      const requestContext = new RequestContext();
      requestContext.set('harness', {
        modeId: 'pentest',
        getState: () => ({
          projectPath: tempDir,
          sandboxAllowedPaths: [],
        }),
      });

      const workspace = getDynamicWorkspace({ requestContext });
      const agent = new Agent({
        id: 'mc-built-in-skill-search-agent',
        name: 'MC Built-In Skill Search Agent',
        instructions: 'Load the hinted SSTI skill.',
        model: new MastraLanguageModelV2Mock({
          doStream: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            warnings: [],
            stream: toStream([
              { type: 'stream-start', warnings: [] },
              { type: 'response-metadata', id: 'id-0', modelId: 'mock', timestamp: new Date(0) },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolCallType: 'function',
                toolName: 'load_skill',
                input: '{"skillName":"pentest-ssti"}',
              },
              {
                type: 'finish',
                finishReason: 'tool-calls',
                usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
              },
            ]),
          }),
        }) as any,
        workspace,
        inputProcessors: [
          new SkillSearchProcessor({
            workspace,
            search: { topK: 5, minScore: 0 },
            ttl: 0,
          }),
        ],
      });

      const result = await agent.stream('Search SSTI skills', { requestContext });
      const chunks: any[] = [];
      for await (const chunk of result.fullStream) {
        chunks.push(chunk);
      }

      const toolResult = chunks.find(chunk => chunk.type === 'tool-result');
      expect(toolResult?.payload.toolName).toBe('load_skill');
      expect(JSON.stringify(toolResult?.payload.result)).toContain('pentest-ssti');
      expect(JSON.stringify(toolResult?.payload.result)).toContain('loaded');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('activates a symlinked local skill by bare name through the mastracode workspace path', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mastracode-workspace-skill-'));

    try {
      const skillName = 'temp-symlink-skill';
      const agentsRoot = path.join(tempDir, '.agents', 'skills');
      const claudeRoot = path.join(tempDir, '.claude', 'skills');
      const canonicalSkillDir = path.join(agentsRoot, skillName);
      const symlinkedSkillDir = path.join(claudeRoot, skillName);
      const capturedPrompts: any[] = [];
      let callCount = 0;

      await fs.mkdir(canonicalSkillDir, { recursive: true });
      await fs.mkdir(claudeRoot, { recursive: true });
      await fs.writeFile(
        path.join(canonicalSkillDir, 'SKILL.md'),
        '---\nname: temp-symlink-skill\ndescription: canonical temp symlink skill\n---\n\n# Temp Symlink Skill\n\nUse the canonical skill.',
      );
      await fs.symlink(canonicalSkillDir, symlinkedSkillDir, 'dir');

      process.chdir(tempDir);
      const { getDynamicWorkspace } = await import('../workspace.js');

      const requestContext = new RequestContext();
      requestContext.set('harness', {
        modeId: 'build',
        getState: () => ({
          projectPath: tempDir,
          sandboxAllowedPaths: [],
        }),
      });

      const workspace = getDynamicWorkspace({ requestContext });

      const agent = new Agent({
        id: 'mc-symlink-skill-agent',
        name: 'MC Symlink Skill Agent',
        instructions: 'You are a test agent.',
        model: new MastraLanguageModelV2Mock({
          doStream: async ({ prompt }) => {
            callCount++;
            capturedPrompts.push(prompt);

            if (callCount === 1) {
              return {
                rawCall: { rawPrompt: null, rawSettings: {} },
                warnings: [],
                stream: toStream([
                  { type: 'stream-start', warnings: [] },
                  { type: 'response-metadata', id: 'id-0', modelId: 'mock', timestamp: new Date(0) },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolCallType: 'function',
                    toolName: 'skill',
                    input: '{"name":"temp-symlink-skill"}',
                  },
                  {
                    type: 'finish',
                    finishReason: 'tool-calls',
                    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                  },
                ]),
              };
            }

            return {
              rawCall: { rawPrompt: null, rawSettings: {} },
              warnings: [],
              stream: toStream([
                { type: 'stream-start', warnings: [] },
                { type: 'response-metadata', id: 'id-1', modelId: 'mock', timestamp: new Date(0) },
                { type: 'text-start', id: 'text-1' },
                { type: 'text-delta', id: 'text-1', delta: 'Loaded temp symlink skill.' },
                { type: 'text-end', id: 'text-1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                },
              ]),
            };
          },
        }) as any,
        workspace,
      });

      const result = await agent.stream('Activate temp-symlink-skill', { requestContext });
      const chunks: any[] = [];
      for await (const chunk of result.fullStream) {
        chunks.push(chunk);
      }

      const toolResultChunk = chunks.find(chunk => chunk.type === 'tool-result');
      expect(toolResultChunk, JSON.stringify(chunks, null, 2)).toBeDefined();
      expect(toolResultChunk.payload.toolName).toBe('skill');
      expect(toolResultChunk.payload.result).toContain('# Temp Symlink Skill');
      expect(toolResultChunk.payload.result).toContain('Use the canonical skill.');
      expect(capturedPrompts).toHaveLength(2);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('supports on-demand skill search, load, and supporting file reads', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mastracode-on-demand-skill-'));

    try {
      const skillName = 'temp-on-demand-skill';
      const skillDir = path.join(tempDir, '.agents', 'skills', skillName);
      const capturedPrompts: any[] = [];
      let callCount = 0;

      await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: temp-on-demand-skill',
          'description: on demand pentest methodology skill',
          '---',
          '',
          '# On Demand Skill',
          '',
          'Use this methodology for scoped pentest testing.',
        ].join('\n'),
      );
      await fs.writeFile(path.join(skillDir, 'references', 'method.md'), 'Reference method content.');

      process.chdir(tempDir);
      const { getDynamicWorkspace } = await import('../workspace.js');

      const requestContext = new RequestContext();
      requestContext.set('harness', {
        modeId: 'pentest',
        getState: () => ({
          projectPath: tempDir,
          sandboxAllowedPaths: [],
        }),
      });

      const workspace = getDynamicWorkspace({ requestContext });
      requestContext.set('harness', {
        modeId: 'pentest',
        workspace,
        getState: () => ({
          projectPath: tempDir,
          sandboxAllowedPaths: [],
        }),
      });

      const agent = new Agent({
        id: 'mc-on-demand-skill-agent',
        name: 'MC On-Demand Skill Agent',
        instructions: 'Use search_skills, load_skill, and skill_read when relevant.',
        model: new MastraLanguageModelV2Mock({
          doStream: async ({ prompt }) => {
            callCount++;
            capturedPrompts.push(prompt);

            if (callCount === 1) {
              return {
                rawCall: { rawPrompt: null, rawSettings: {} },
                warnings: [],
                stream: toStream([
                  { type: 'stream-start', warnings: [] },
                  { type: 'response-metadata', id: 'id-0', modelId: 'mock', timestamp: new Date(0) },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolCallType: 'function',
                    toolName: 'search_skills',
                    input: '{"query":"scoped pentest testing"}',
                  },
                  {
                    type: 'finish',
                    finishReason: 'tool-calls',
                    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                  },
                ]),
              };
            }

            if (callCount === 2) {
              return {
                rawCall: { rawPrompt: null, rawSettings: {} },
                warnings: [],
                stream: toStream([
                  { type: 'stream-start', warnings: [] },
                  { type: 'response-metadata', id: 'id-1', modelId: 'mock', timestamp: new Date(0) },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-2',
                    toolCallType: 'function',
                    toolName: 'load_skill',
                    input: '{"skillName":"temp-on-demand-skill"}',
                  },
                  {
                    type: 'finish',
                    finishReason: 'tool-calls',
                    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                  },
                ]),
              };
            }

            if (callCount === 3) {
              return {
                rawCall: { rawPrompt: null, rawSettings: {} },
                warnings: [],
                stream: toStream([
                  { type: 'stream-start', warnings: [] },
                  { type: 'response-metadata', id: 'id-2', modelId: 'mock', timestamp: new Date(0) },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-3',
                    toolCallType: 'function',
                    toolName: 'skill_read',
                    input: '{"skillName":"temp-on-demand-skill","path":"references/method.md"}',
                  },
                  {
                    type: 'finish',
                    finishReason: 'tool-calls',
                    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                  },
                ]),
              };
            }

            return {
              rawCall: { rawPrompt: null, rawSettings: {} },
              warnings: [],
              stream: toStream([
                { type: 'stream-start', warnings: [] },
                { type: 'response-metadata', id: 'id-3', modelId: 'mock', timestamp: new Date(0) },
                { type: 'text-start', id: 'text-1' },
                { type: 'text-delta', id: 'text-1', delta: 'Finished on-demand skill flow.' },
                { type: 'text-end', id: 'text-1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                },
              ]),
            };
          },
        }) as any,
        workspace,
        inputProcessors: [
          new SkillSearchProcessor({
            workspace,
            search: { topK: 5, minScore: 0 },
            ttl: 0,
          }),
        ],
      });

      const result = await agent.stream('Use on-demand skills', { requestContext });
      const chunks: any[] = [];
      for await (const chunk of result.fullStream) {
        chunks.push(chunk);
      }

      const toolResults = chunks.filter(chunk => chunk.type === 'tool-result');
      expect(toolResults.map(chunk => chunk.payload.toolName)).toEqual(['search_skills', 'load_skill', 'skill_read']);
      expect(toolResults.at(0)?.payload.result.message).toContain('Found');
      expect(toolResults.at(1)?.payload.result.success).toBe(true);
      expect(toolResults.at(2)?.payload.result).toContain('Reference method content.');
      expect(JSON.stringify(capturedPrompts)).toContain('[Skill: temp-on-demand-skill]');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
