import { describe, expect, it } from 'vitest';

import { PROVIDER_DEFAULT_MODELS } from '../../auth/storage.js';
import { getAvailableModePacks } from '../packs.js';

describe('getAvailableModePacks', () => {
  it('uses GPT-5.5 for OpenAI plan, build, and pentest modes while keeping fast on GPT-5.4 mini', () => {
    const packs = getAvailableModePacks({
      anthropic: false,
      openai: 'oauth',
      cerebras: false,
      google: false,
      deepseek: false,
      'github-copilot': false,
    });

    expect(packs.find(pack => pack.id === 'openai')?.models).toEqual({
      plan: 'openai/gpt-5.5',
      build: 'openai/gpt-5.5',
      fast: 'openai/gpt-5.4-mini',
      pentest: 'openai/gpt-5.5',
    });
  });

  it('keeps the OpenAI OAuth post-login default aligned with the build model', () => {
    const packs = getAvailableModePacks({
      anthropic: false,
      openai: 'oauth',
      cerebras: false,
      google: false,
      deepseek: false,
      'github-copilot': false,
    });

    expect(PROVIDER_DEFAULT_MODELS['openai-codex']).toBe(packs.find(pack => pack.id === 'openai')?.models.build);
  });

  it('exposes a GitHub Copilot pack with defaults for build, plan, fast, and pentest modes', () => {
    const packs = getAvailableModePacks({
      anthropic: false,
      openai: false,
      cerebras: false,
      google: false,
      deepseek: false,
      'github-copilot': 'oauth',
    });

    const pack = packs.find(p => p.id === 'github-copilot');
    expect(pack).toBeDefined();
    expect(pack?.models).toEqual({
      plan: 'github-copilot/gemini-2.5-pro',
      build: 'github-copilot/gpt-4.1',
      fast: 'github-copilot/grok-code-fast-1',
      pentest: 'github-copilot/gemini-2.5-pro',
    });
  });

  it('keeps the GitHub Copilot OAuth post-login default aligned with the build model', () => {
    const packs = getAvailableModePacks({
      anthropic: false,
      openai: false,
      cerebras: false,
      google: false,
      deepseek: false,
      'github-copilot': 'oauth',
    });

    expect(PROVIDER_DEFAULT_MODELS['github-copilot']).toBe(
      packs.find(pack => pack.id === 'github-copilot')?.models.build,
    );
  });

  it('hides the GitHub Copilot pack when access is unavailable', () => {
    const packs = getAvailableModePacks({
      anthropic: false,
      openai: false,
      cerebras: false,
      google: false,
      deepseek: false,
      'github-copilot': false,
    });

    expect(packs.find(p => p.id === 'github-copilot')).toBeUndefined();
  });
});
