export type Severity = 'informational' | 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_RANK: Record<Severity, number> = {
  informational: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function normalizeSeverity(value: string | undefined): Severity {
  const normalized = value?.toLowerCase().trim();
  if (
    normalized === 'critical' ||
    normalized === 'high' ||
    normalized === 'medium' ||
    normalized === 'low' ||
    normalized === 'informational'
  ) {
    return normalized;
  }
  if (normalized === 'info') return 'informational';
  return 'informational';
}

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

export function maxSeverity(values: Severity[]): Severity {
  return values.reduce((max, value) => (compareSeverity(value, max) > 0 ? value : max), 'informational');
}
