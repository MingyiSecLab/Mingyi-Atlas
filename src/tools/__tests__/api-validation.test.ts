import http from 'node:http';
import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it } from 'vitest';

import { graphqlValidateTool } from '../graphql-validate.js';
import { jwtAnalyzeTool } from '../jwt-analyze.js';
import { sqliProbeTool } from '../sqli-probe.js';

let servers: http.Server[] = [];

function createContext(projectPath = process.cwd()) {
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

async function startServer(handler: http.RequestListener): Promise<{ url: string }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unexpected server address');
  return { url: `http://127.0.0.1:${address.port}` };
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

afterEach(async () => {
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  servers = [];
});

describe('api validation tools', () => {
  it('decodes JWTs and reports common claim risks offline', async () => {
    const token = `${b64urlJson({ alg: 'none', typ: 'JWT' })}.${b64urlJson({ sub: 'user' })}.`;

    const result = await jwtAnalyzeTool.execute({ token }, createContext() as any);

    expect(result.success).toBe(true);
    expect(result.header).toMatchObject({ alg: 'none' });
    expect(result.payload).toMatchObject({ sub: 'user' });
    expect(result.issues).toContain('alg_none');
    expect(result.issues).toContain('missing_exp');
  });

  it('runs a scoped read-only GraphQL request against localhost', async () => {
    const { url } = await startServer((req, res) => {
      expect(req.method).toBe('POST');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { __typename: 'Query' } }));
    });

    const result = await graphqlValidateTool.execute(
      {
        endpoint: `${url}/graphql`,
        query: '{ __typename }',
      },
      createContext() as any,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.hasGraphQlErrors).toBe(false);
    expect(result.json).toMatchObject({ data: { __typename: 'Query' } });
  });

  it('blocks external SQLi probes when the host is not in scope', async () => {
    const result = await sqliProbeTool.execute(
      {
        url: 'https://out-of-scope.example/search?q=test',
        parameter: 'q',
      },
      createContext() as any,
    );

    expect(result.success).toBe(false);
    expect(result.baseline).toMatchObject({ error: 'scope_violation' });
  });
});
