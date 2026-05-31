import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { recordPentestAsset, recordPentestEndpoint, recordPentestScope } from '../../security/pentest/context.js';
import { getPentestContextPath } from '../../security/pentest/context.js';
import { getPentestFindingsPath, reportPentestFinding } from '../../security/pentest/findings.js';
import { generateReportTool } from '../report.js';

let tempDirs: string[] = [];

function createContext(projectPath: string) {
  return {
    requestContext: {
      get(key: string) {
        if (key !== 'harness') return undefined;
        return {
          getState: () => ({ projectPath, configDir: '.mingyi-atlas' }),
        };
      },
    },
  };
}

function tempProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mingyi-atlas-report-tool-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('generate_report tool', () => {
  it('writes a report from persisted pentest context and findings', async () => {
    const projectPath = tempProject();
    const contextPath = getPentestContextPath(projectPath, '.mingyi-atlas');
    const findingsPath = getPentestFindingsPath(projectPath, '.mingyi-atlas');
    recordPentestScope(contextPath, {
      target: 'https://app.example.com',
      type: 'url',
    });
    recordPentestAsset(contextPath, {
      type: 'url',
      identifier: 'https://app.example.com',
    });
    recordPentestEndpoint(contextPath, {
      method: 'POST',
      path: '/login',
      authRequired: false,
    });
    reportPentestFinding(findingsPath, {
      severity: 'high',
      title: 'Reflected XSS',
      description: 'The solution parameter is reflected without output encoding.',
      category: 'Cross-Site Scripting',
      cweId: 'CWE-79',
      endpoint: 'POST /xss25',
      attackVector: 'request_body',
      evidence: '<input autofocus onfocus=alert("XSS")> executed in validation context.',
      stepsToReproduce: 'POST solution payload to /xss25.',
      businessImpact: 'An attacker can execute JavaScript in a victim browser.',
      recommendation: 'Apply context-aware output encoding.',
      validationStatus: 'validated',
    });

    const result = await generateReportTool.execute(
      {
        title: 'Scoped Test Report',
        format: 'both',
        outputBaseName: 'scoped-test-report',
      },
      createContext(projectPath) as any,
    );

    expect(result.success).toBe(true);
    expect(result.summary.findingCount).toBe(1);
    expect(result.markdownPath).toBe(
      path.join(projectPath, '.mingyi-atlas', 'pentest', 'targets', 'unscoped', 'reports', 'scoped-test-report.md'),
    );
    expect(result.jsonPath).toBe(
      path.join(projectPath, '.mingyi-atlas', 'pentest', 'targets', 'unscoped', 'reports', 'scoped-test-report.json'),
    );
    expect(existsSync(result.markdownPath)).toBe(true);
    expect(readFileSync(result.markdownPath, 'utf-8')).toContain('### HIGH: Reflected XSS');
  });

  it('creates an empty report when no pentest files exist yet', async () => {
    const projectPath = tempProject();
    const result = await generateReportTool.execute(
      {
        outputBaseName: 'empty-report',
      },
      createContext(projectPath) as any,
    );

    expect(result.success).toBe(true);
    expect(result.summary.findingCount).toBe(0);
    expect(result.markdownPath).toBe(
      path.join(projectPath, '.mingyi-atlas', 'pentest', 'targets', 'unscoped', 'reports', 'empty-report.md'),
    );
    expect(readFileSync(result.markdownPath, 'utf-8')).toContain('No findings were recorded.');
  });
});
