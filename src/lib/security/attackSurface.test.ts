import { describe, expect, it } from 'vitest';
import { inferTargetObjectives, toSwarmTarget } from './attackSurface.js';

describe('inferTargetObjectives', () => {
  it('derives authentication objectives for login targets', () => {
    const objectives = inferTargetObjectives({ target: '/login', kind: 'auth' });

    expect(objectives).toContain('Test authentication bypass');
    expect(objectives).toContain('Test user enumeration');
    expect(objectives).toContain('Test brute-force and rate-limit weakness');
    expect(objectives).toContain('Test session fixation');
  });

  it('derives order endpoint objectives from business semantics', () => {
    const objectives = inferTargetObjectives({
      target: '/api/orders/:id',
      method: 'PUT',
      kind: 'api',
      authRequired: true,
      parameters: [{ name: 'id', location: 'path' }],
    });

    expect(objectives).toContain('Test IDOR on business objects');
    expect(objectives).toContain('Test missing authorization');
    expect(objectives).toContain('Test tenant isolation');
    expect(objectives).toContain('Test mass assignment of owner, tenant, status, or price fields');
    expect(objectives).toContain('Test sensitive data exposure');
  });

  it('derives upload objectives for upload surfaces', () => {
    const objectives = inferTargetObjectives({ target: '/upload-avatar', kind: 'upload' });

    expect(objectives).toContain('Test unrestricted file upload');
    expect(objectives).toContain('Test content-type bypass');
    expect(objectives).toContain('Test stored XSS through uploaded content');
    expect(objectives).toContain('Test path traversal in file handling');
  });

  it('derives search objectives for query surfaces', () => {
    const objectives = inferTargetObjectives({
      target: '/products/search',
      kind: 'page',
      parameters: [{ name: 'q', location: 'query' }],
    });

    expect(objectives).toContain('Test reflected XSS');
    expect(objectives).toContain('Test SQL or NoSQL injection');
    expect(objectives).toContain('Test template injection');
  });

  it('derives admin objectives for admin surfaces', () => {
    const objectives = inferTargetObjectives({ target: '/admin/users', kind: 'admin', authRequired: true });

    expect(objectives).toContain('Test admin access control bypass');
    expect(objectives).toContain('Test privilege escalation');
  });

  it('derives callback objectives for oauth callbacks', () => {
    const objectives = inferTargetObjectives({ target: '/oauth/callback', kind: 'callback' });

    expect(objectives).toContain('Test OAuth or SSO callback validation');
    expect(objectives).toContain('Test redirect URI and state handling');
  });

  it('derives static JavaScript objectives for client bundles', () => {
    const objectives = inferTargetObjectives({ target: '/static/js/app.js', kind: 'static-js' });

    expect(objectives).toContain('Extract client-side routes and API endpoints');
    expect(objectives).toContain('Check for exposed sensitive secrets');
  });

  it('normalizes attack surface items into swarm targets', () => {
    const target = toSwarmTarget({
      id: 'login',
      target: '/login',
      kind: 'auth',
      source: 'blackbox',
    });

    expect(target.objectives).toContain('Test authentication bypass');
    expect(target.source).toBe('blackbox');
  });
});
