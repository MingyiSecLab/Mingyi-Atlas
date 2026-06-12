import { describe, expect, it } from 'vitest';

import { extractJsEndpointsFromContent } from '../extractJsEndpoints.js';

describe('extractJsEndpointsFromContent', () => {
  it('extracts endpoints from common JavaScript and HTML patterns', () => {
    const endpoints = extractJsEndpointsFromContent(
      `
        fetch('/api/users');
        axios.post("/api/orders", {});
        xhr.open("DELETE", "/api/files/123");
        $.ajax({ url: "/api/search?q=test" });
        <form action="/login" method="post"></form>
      `,
      { sourceUrl: 'https://app.example.com/dashboard' },
    );

    expect(endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: '/api/users', resolvedUrl: 'https://app.example.com/api/users' }),
        expect.objectContaining({ value: '/api/orders', method: 'POST' }),
        expect.objectContaining({ value: '/api/files/123', method: 'DELETE' }),
        expect.objectContaining({ value: '/api/search?q=test' }),
        expect.objectContaining({ value: '/login' }),
      ]),
    );
  });

  it('filters static assets unless requested', () => {
    const content = `<script src="/app.js"></script><link href="/style.css"><fetch('/api/data')>`;

    const defaultEndpoints = extractJsEndpointsFromContent(content);
    expect(defaultEndpoints.map(endpoint => endpoint.value)).toEqual(['/api/data']);

    const withAssets = extractJsEndpointsFromContent(content, { includeStaticAssets: true });
    expect(withAssets.map(endpoint => endpoint.value)).toEqual(['/api/data', '/app.js', '/style.css']);
  });
});
