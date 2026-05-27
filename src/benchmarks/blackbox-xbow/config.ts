import path from 'node:path';
import { z } from 'zod';
import type { XBowBenchmarkConfig } from './types.js';

export const DEFAULT_XBOW_SUITE_PATH = path.join('benchmark', 'xbow-validation-benchmarks');

const ConfigInputSchema = z.object({
  suitePath: z.string().min(1),
  outputDir: z.string().optional(),
  ids: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  levels: z.array(z.number().int().positive()).optional(),
  rangeStart: z.number().int().positive().optional(),
  rangeEnd: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  timeoutMinutes: z.number().positive().optional(),
  readinessTimeoutMs: z.number().int().positive().optional(),
  cleanup: z.boolean().optional(),
  concurrency: z.number().int().positive().optional(),
  continueOnFailure: z.boolean().optional(),
});

export type XBowBenchmarkConfigInput = z.input<typeof ConfigInputSchema>;

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function parseLevels(value: string | undefined): number[] | undefined {
  return splitCsv(value)?.map(level => {
    const parsed = Number(level);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid benchmark level: ${level}`);
    return parsed;
  });
}

export function parseXBowBenchmarkConfig(input: XBowBenchmarkConfigInput): XBowBenchmarkConfig {
  const parsed = ConfigInputSchema.parse(input);
  const suitePath = path.resolve(parsed.suitePath);
  const outputDir = path.resolve(parsed.outputDir ?? path.join('artifacts', 'benchmarks', 'blackbox-xbow'));
  return {
    suitePath,
    outputDir,
    filters: {
      ids: parsed.ids,
      tags: parsed.tags,
      levels: parsed.levels,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
    },
    timeoutMs: parsed.timeoutMs ?? Math.round((parsed.timeoutMinutes ?? 30) * 60 * 1000),
    readinessTimeoutMs: parsed.readinessTimeoutMs ?? 120_000,
    cleanup: parsed.cleanup ?? true,
    concurrency: parsed.concurrency ?? 1,
    continueOnFailure: parsed.continueOnFailure ?? true,
  };
}

export function parseXBowBenchmarkCliArgs(args: string[]): XBowBenchmarkConfig {
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'no-cleanup') {
      options.cleanup = false;
      continue;
    }
    if (key === 'fail-fast') {
      options.continueOnFailure = false;
      continue;
    }
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    i += 1;
  }

  return parseXBowBenchmarkConfig({
    suitePath: String(options.suite ?? options['suite-path'] ?? DEFAULT_XBOW_SUITE_PATH),
    outputDir: typeof options.output === 'string' ? options.output : undefined,
    ids: splitCsv(typeof options.ids === 'string' ? options.ids : undefined),
    tags: splitCsv(typeof options.tags === 'string' ? options.tags : undefined),
    levels: parseLevels(typeof options.levels === 'string' ? options.levels : undefined),
    rangeStart: typeof options['range-start'] === 'string' ? Number(options['range-start']) : undefined,
    rangeEnd: typeof options['range-end'] === 'string' ? Number(options['range-end']) : undefined,
    timeoutMinutes: typeof options.timeout === 'string' ? Number(options.timeout) : undefined,
    readinessTimeoutMs: typeof options['readiness-timeout-ms'] === 'string' ? Number(options['readiness-timeout-ms']) : undefined,
    cleanup: typeof options.cleanup === 'boolean' ? options.cleanup : undefined,
    concurrency: typeof options.concurrency === 'string' ? Number(options.concurrency) : undefined,
    continueOnFailure: typeof options.continueOnFailure === 'boolean' ? options.continueOnFailure : undefined,
  });
}
