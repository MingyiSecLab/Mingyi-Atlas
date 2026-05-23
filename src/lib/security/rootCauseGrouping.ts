import type { SecurityFinding } from './findings.js';

function defaultGroupKey(finding: SecurityFinding): string {
  const normalizedTitle = finding.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedTarget = finding.target.replace(/\/\d+(?=\/|$)/g, '/:id');
  return `${normalizedTitle}:${normalizedTarget}`;
}

export function groupFindingsByRootCause(findings: SecurityFinding[]): Map<string, SecurityFinding[]> {
  const groups = new Map<string, SecurityFinding[]>();
  for (const finding of findings) {
    const key = finding.rootCauseGroup ?? defaultGroupKey(finding);
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }
  return groups;
}
