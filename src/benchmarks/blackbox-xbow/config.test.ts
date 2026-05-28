import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_XBOW_SUITE_PATH, parseXBowBenchmarkCliArgs, parseXBowBenchmarkConfig } from './config.js';

describe('blackbox XBOW benchmark config', () => {
  it('applies defaults and resolves paths', () => {
    const config = parseXBowBenchmarkConfig({ suitePath: 'validation-benchmarks' });

    expect(config.suitePath).toBe(path.resolve('validation-benchmarks'));
    expect(config.outputDir).toBe(path.resolve('artifacts/benchmarks/blackbox-xbow'));
    expect(config.timeoutMs).toBe(30 * 60 * 1000);
    expect(config.readinessTimeoutMs).toBe(120_000);
    expect(config.cleanup).toBe(true);
    expect(config.concurrency).toBe(1);
    expect(config.continueOnFailure).toBe(true);
    expect(config.filters).toEqual({});
  });

  it('parses CLI filters and execution knobs', () => {
    const config = parseXBowBenchmarkCliArgs([
      '--suite',
      './suite',
      '--output',
      './out',
      '--ids',
      'XBEN-001-24,XBEN-002-24',
      '--tags',
      'sqli,auth-bypass',
      '--levels',
      '1,2',
      '--range-start',
      '2',
      '--range-end',
      '5',
      '--timeout',
      '10',
      '--readiness-timeout-ms',
      '5000',
      '--concurrency',
      '2',
      '--model',
      'openai/gpt-5.4',
      '--no-cleanup',
      '--fail-fast',
    ]);

    expect(config.suitePath).toBe(path.resolve('./suite'));
    expect(config.outputDir).toBe(path.resolve('./out'));
    expect(config.filters).toEqual({
      ids: ['XBEN-001-24', 'XBEN-002-24'],
      tags: ['sqli', 'auth-bypass'],
      levels: [1, 2],
      rangeStart: 2,
      rangeEnd: 5,
    });
    expect(config.timeoutMs).toBe(10 * 60 * 1000);
    expect(config.readinessTimeoutMs).toBe(5000);
    expect(config.concurrency).toBe(2);
    expect(config.modelId).toBe('openai/gpt-5.4');
    expect(config.cleanup).toBe(false);
    expect(config.continueOnFailure).toBe(false);
  });

  it('defaults CLI suite path to the configured XBOW submodule', () => {
    const config = parseXBowBenchmarkCliArgs([]);

    expect(config.suitePath).toBe(path.resolve(DEFAULT_XBOW_SUITE_PATH));
  });

  it('rejects missing suite path and invalid levels', () => {
    expect(() => parseXBowBenchmarkConfig({ suitePath: '' })).toThrow();
    expect(() => parseXBowBenchmarkCliArgs(['--suite', './suite', '--levels', 'easy'])).toThrow('Invalid benchmark level');
  });
});
