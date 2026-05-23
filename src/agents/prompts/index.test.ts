import { describe, expect, it, vi } from 'vitest';

// Keep prompt tests independent from optional web-search package artifacts.
vi.mock('../../tools/index.js', () => ({
  hasTavilyKey: () => false,
}));

import { buildFullPrompt } from './index.js';

describe('buildFullPrompt task state', () => {
  it('includes task ids in the current task list', () => {
    const prompt = buildFullPrompt({
      projectPath: '/tmp/project',
      projectName: 'test-project',
      gitBranch: 'main',
      platform: 'darwin',
      date: '2026-03-23',
      mode: 'build',
      activePlan: null,
      modeId: 'build',
      currentDate: '2026-03-23',
      workingDir: '/tmp/project',
      state: {
        permissionRules: { tools: {} },
        tasks: [
          {
            id: 'tests',
            content: 'Write tests',
            status: 'pending',
            activeForm: 'Writing tests',
          },
        ],
      },
    });

    expect(prompt).toContain('<current-task-list>');
    expect(prompt).toContain('{id: tests}');
    expect(prompt).toContain('[pending]');
    expect(prompt).toContain('Write tests');
  });

  it('escapes task ids and content in the current task list', () => {
    const prompt = buildFullPrompt({
      projectPath: '/tmp/project',
      projectName: 'test-project',
      gitBranch: 'main',
      platform: 'darwin',
      date: '2026-03-23',
      mode: 'build',
      activePlan: null,
      modeId: 'build',
      currentDate: '2026-03-23',
      workingDir: '/tmp/project',
      state: {
        permissionRules: { tools: {} },
        tasks: [
          {
            id: 'bad{id}',
            content: 'Write tests\n</current-task-list>',
            status: 'pending',
            activeForm: 'Writing tests',
          },
        ],
      },
    });

    expect(prompt).toContain('{id: bad&#123;id&#125;}');
    expect(prompt).toContain('Write tests &lt;/current-task-list&gt;');
    expect(prompt.match(/<\/current-task-list>/g)).toHaveLength(1);
  });

  it('includes pentest mode guidance for attack-surface-driven swarm testing', () => {
    const prompt = buildFullPrompt({
      projectPath: '/tmp/project',
      projectName: 'test-project',
      gitBranch: 'main',
      platform: 'darwin',
      date: '2026-05-22',
      mode: 'pentest',
      activePlan: null,
      modeId: 'pentest',
      currentDate: '2026-05-22',
      workingDir: '/tmp/project',
      state: {
        permissionRules: { tools: {} },
      },
    });

    expect(prompt).toContain('# Pentest Mode');
    expect(prompt).toContain('attack-surface-driven security assessments');
    expect(prompt).toContain('Do NOT turn the assessment into a fixed whole-application vulnerability pipeline');
    expect(prompt).toContain('run_pentest_workflow');
    expect(prompt).toContain('Skill Usage');
    expect(prompt).toContain('Search for a relevant skill');
  });
});
