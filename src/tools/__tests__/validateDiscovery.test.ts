import { describe, expect, it } from 'vitest';

import { validateDiscoveryCoverage } from '../validateDiscovery.js';

describe('validateDiscoveryCoverage', () => {
  it('returns complete when discovery coverage has no major gaps', () => {
    const result = validateDiscoveryCoverage({
      assetsCount: 2,
      discoveredEndpoints: ['/api/users', '/api/orders', '/api/files', '/login', '/logout'],
      pagesWithJSAnalyzed: ['/dashboard.js'],
      findingsCount: 0,
      activeValidationPerformed: false,
    });

    expect(result.complete).toBe(true);
    expect(result.gaps).toEqual([]);
  });

  it('flags critical authenticated coverage gaps when credentials were found', () => {
    const result = validateDiscoveryCoverage({
      assetsCount: 1,
      discoveredEndpoints: ['/api/users/:id'],
      credentialsFound: true,
      authenticatedWithCredentials: false,
      pagesWithJSAnalyzed: [],
    });

    expect(result.complete).toBe(false);
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'critical',
          gap: 'Credentials found but authenticated coverage was not performed',
        }),
        expect.objectContaining({
          severity: 'high',
          gap: 'Object-specific endpoints found but no authorization findings or notes recorded',
        }),
      ]),
    );
  });
});
