import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const validateDiscoveryInputSchema = z.object({
  discoveredEndpoints: z.array(z.string()).default([]).describe('Discovered endpoint paths or URLs.'),
  assetsCount: z.number().int().nonnegative().default(0).describe('Number of discovered assets/services/applications.'),
  findingsCount: z.number().int().nonnegative().default(0).describe('Number of candidate or validated findings recorded.'),
  credentialsFound: z.boolean().default(false).describe('Whether credentials or session material were discovered.'),
  authenticatedWithCredentials: z
    .boolean()
    .default(false)
    .describe('Whether discovered credentials were used with explicit authorization.'),
  pagesWithJSAnalyzed: z.array(z.string()).default([]).describe('Pages or files where JavaScript was analyzed.'),
  activeValidationPerformed: z.boolean().default(false).describe('Whether non-destructive active validation was performed.'),
});

export interface DiscoveryGap {
  gap: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

export function validateDiscoveryCoverage(input: z.input<typeof validateDiscoveryInputSchema>) {
  const parsed = validateDiscoveryInputSchema.parse(input);
  const gaps: DiscoveryGap[] = [];
  let confidence = 100;

  if (parsed.assetsCount === 0) {
    gaps.push({
      gap: 'No assets or services recorded',
      severity: 'high',
      recommendation: 'Identify the application, service, repository, or host assets before reporting.',
    });
    confidence -= 25;
  }

  if (parsed.discoveredEndpoints.length < 5) {
    gaps.push({
      gap: 'Very few endpoints discovered',
      severity: 'medium',
      recommendation: 'Review routes, API handlers, frontend code, and configuration for additional endpoints.',
    });
    confidence -= 15;
  }

  if (parsed.credentialsFound && !parsed.authenticatedWithCredentials) {
    gaps.push({
      gap: 'Credentials found but authenticated coverage was not performed',
      severity: 'critical',
      recommendation: 'Confirm authorization and perform authenticated review with the discovered credentials.',
    });
    confidence -= 35;
  }

  if (parsed.discoveredEndpoints.some(endpoint => /\{id\}|:id|\/\d+(?:\/|$)/i.test(endpoint)) && parsed.findingsCount === 0) {
    gaps.push({
      gap: 'Object-specific endpoints found but no authorization findings or notes recorded',
      severity: 'high',
      recommendation: 'Review IDOR and authorization boundaries for object-specific endpoints.',
    });
    confidence -= 20;
  }

  if (parsed.pagesWithJSAnalyzed.length === 0) {
    gaps.push({
      gap: 'No JavaScript or frontend endpoint extraction recorded',
      severity: 'medium',
      recommendation: 'Run extract_js_endpoints on relevant frontend bundles or HTML pages.',
    });
    confidence -= 15;
  }

  if (parsed.findingsCount > 0 && !parsed.activeValidationPerformed) {
    gaps.push({
      gap: 'Findings exist without active validation',
      severity: 'low',
      recommendation: 'Mark unvalidated issues as candidate or perform scoped non-destructive validation.',
    });
    confidence -= 10;
  }

  const boundedConfidence = Math.max(0, Math.min(100, confidence));
  return {
    complete: boundedConfidence >= 85 && !gaps.some(gap => gap.severity === 'critical'),
    confidence: boundedConfidence,
    gaps,
    readyForReport: boundedConfidence >= 85 && !gaps.some(gap => gap.severity === 'critical'),
    summary:
      gaps.length === 0
        ? 'Discovery coverage looks complete for a first-pass report.'
        : `Discovery coverage has ${gaps.length} gap(s); confidence ${boundedConfidence}%.`,
  };
}

export const validateDiscoveryTool = createTool({
  id: 'validate_discovery',
  description:
    'Evaluate pentest discovery coverage and identify gaps before reporting. Pure analysis; does not read files or make network requests.',
  inputSchema: validateDiscoveryInputSchema,
  execute: async input => validateDiscoveryCoverage(input),
});
