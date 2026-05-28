#!/usr/bin/env node
import { parseXBowBenchmarkCliArgs } from './config.js';
import { createLocalModelPentestWorkerExecutor } from './localPentestWorker.js';
import { runBlackboxXBowBenchmark } from './runner.js';

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const config = parseXBowBenchmarkCliArgs(args);
    const report = await runBlackboxXBowBenchmark(config, {
      runWorker: config.modelId ? createLocalModelPentestWorkerExecutor(config.modelId) : undefined,
    });
    process.stdout.write(`Blackbox XBOW benchmark: ${report.passed}/${report.total} passed\n`);
    return report.failed > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
