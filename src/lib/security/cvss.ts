import type { Severity } from './severity.js';

export interface CvssScore {
  score: number;
  severity: Severity;
  vector?: string;
}

export function severityFromCvss(score: number): Severity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'informational';
}

export function createCvssScore(score: number, vector?: string): CvssScore {
  const boundedScore = Math.max(0, Math.min(10, Number.isFinite(score) ? score : 0));
  return {
    score: boundedScore,
    severity: severityFromCvss(boundedScore),
    vector,
  };
}
