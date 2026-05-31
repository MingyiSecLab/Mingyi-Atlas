import { describe, expect, it, vi } from 'vitest';

vi.mock('../../tools/index.js', () => ({
  createContextTools: () => ({
    record_scope: { description: 'record scope' },
    list_scope: { description: 'list scope' },
    record_asset: { description: 'record asset' },
    list_assets: { description: 'list assets' },
    record_endpoint: { description: 'record endpoint' },
    list_endpoints: { description: 'list endpoints' },
    add_retest_item: { description: 'add retest item' },
    list_retest_queue: { description: 'list retest queue' },
    update_retest_item: { description: 'update retest item' },
  }),
  createFindingTools: () => ({
    report_finding: { description: 'report finding' },
    list_findings: { description: 'list findings' },
    get_finding: { description: 'get finding' },
    update_finding: { description: 'update finding' },
  }),
  cveSearchTool: { description: 'cve search' },
  detectAuthSchemeTool: { description: 'detect auth scheme' },
  detectCaptchaTool: { description: 'detect captcha' },
  createWebSearchTool: () => ({ description: 'web search' }),
  createWebExtractTool: () => ({ description: 'web extract' }),
  extractJsEndpointsTool: { description: 'extract js endpoints' },
  generateReportTool: { description: 'generate report' },
  hasTavilyKey: () => false,
  httpRequestTool: { description: 'http request' },
  requestSandboxAccessTool: { description: 'request sandbox access' },
  runBrowserCliTool: { description: 'run browser cli' },
  runContainerTool: { description: 'run container tool' },
  validateDiscoveryTool: { description: 'validate discovery' },
}));

import { createDynamicTools } from '../tools.js';

function createRequestContext(state: Record<string, unknown>, modeId: string = 'build') {
  return {
    get(key: string) {
      if (key !== 'harness') return undefined;
      return {
        modeId,
        getState: () => state,
      };
    },
  } as any;
}

describe('createDynamicTools', () => {
  it('merges extra tools into the exposed tool map', () => {
    const customTool = {
      description: 'custom',
      async execute() {
        return { ok: true };
      },
    };

    const getDynamicTools = createDynamicTools(undefined, {
      custom_tool: customTool,
    });

    const allowedTools = getDynamicTools({
      requestContext: createRequestContext({
        projectPath: process.cwd(),
      }),
    });
    expect(allowedTools.custom_tool).toBeDefined();
  });

  it('exposes structured pentest finding tools in pentest mode only', () => {
    const getDynamicTools = createDynamicTools();

    const buildTools = getDynamicTools({
      requestContext: createRequestContext({ projectPath: process.cwd() }, 'build'),
    });
    expect(buildTools.report_finding).toBeUndefined();

    const pentestTools = getDynamicTools({
      requestContext: createRequestContext({ projectPath: process.cwd() }, 'pentest'),
    });
    expect(pentestTools.report_finding).toBeDefined();
    expect(pentestTools.list_findings).toBeDefined();
    expect(pentestTools.get_finding).toBeDefined();
    expect(pentestTools.update_finding).toBeDefined();
    expect(pentestTools.http_request).toBeDefined();
    expect(pentestTools.run_browser_cli).toBeDefined();
    expect(pentestTools.run_container_tool).toBeDefined();
    expect(pentestTools.cve_search).toBeDefined();
    expect(pentestTools.detect_auth_scheme).toBeDefined();
    expect(pentestTools.detect_captcha).toBeDefined();
    expect(pentestTools.extract_js_endpoints).toBeDefined();
    expect(pentestTools.generate_report).toBeDefined();
    expect(pentestTools.validate_discovery).toBeDefined();
    expect(pentestTools.record_scope).toBeDefined();
    expect(pentestTools.list_scope).toBeDefined();
    expect(pentestTools.record_asset).toBeDefined();
    expect(pentestTools.list_assets).toBeDefined();
    expect(pentestTools.record_endpoint).toBeDefined();
    expect(pentestTools.list_endpoints).toBeDefined();
    expect(pentestTools.add_retest_item).toBeDefined();
    expect(pentestTools.list_retest_queue).toBeDefined();
    expect(pentestTools.update_retest_item).toBeDefined();
  });

  it('runs pre/post hooks around tool execution', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const hookManager = {
      runPreToolUse: vi.fn(async () => ({ allowed: true, results: [], warnings: [] })),
      runPostToolUse: vi.fn(async () => ({ allowed: true, results: [], warnings: [] })),
    };

    const getDynamicTools = createDynamicTools(
      undefined,
      {
        custom_tool: {
          description: 'custom',
          execute,
        },
      },
      hookManager as any,
    );

    const tools = getDynamicTools({
      requestContext: createRequestContext({
        projectPath: process.cwd(),
      }),
    });

    const input = { foo: 'bar' };
    const output = await tools.custom_tool.execute(input, {});

    expect(output).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith(input, {});
    expect(hookManager.runPreToolUse).toHaveBeenCalledWith('custom_tool', input);
    expect(hookManager.runPostToolUse).toHaveBeenCalledWith('custom_tool', input, { ok: true }, false);
  });

  it('blocks tool execution when PreToolUse denies access', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const hookManager = {
      runPreToolUse: vi.fn(async () => ({
        allowed: false,
        blockReason: 'blocked by policy',
        results: [],
        warnings: [],
      })),
      runPostToolUse: vi.fn(async () => ({ allowed: true, results: [], warnings: [] })),
    };

    const getDynamicTools = createDynamicTools(
      undefined,
      {
        custom_tool: {
          description: 'custom',
          execute,
        },
      },
      hookManager as any,
    );

    const tools = getDynamicTools({
      requestContext: createRequestContext({
        projectPath: process.cwd(),
      }),
    });

    const result = await tools.custom_tool.execute({ foo: 'bar' }, {});
    expect(result).toEqual({ error: 'blocked by policy' });
    expect(execute).not.toHaveBeenCalled();
    expect(hookManager.runPostToolUse).not.toHaveBeenCalled();
  });

  it('still runs PostToolUse when tool execution throws', async () => {
    const execute = vi.fn(async () => {
      throw new Error('boom');
    });
    const hookManager = {
      runPreToolUse: vi.fn(async () => ({ allowed: true, results: [], warnings: [] })),
      runPostToolUse: vi.fn(async () => ({ allowed: true, results: [], warnings: [] })),
    };

    const getDynamicTools = createDynamicTools(
      undefined,
      {
        custom_tool: {
          description: 'custom',
          execute,
        },
      },
      hookManager as any,
    );

    const tools = getDynamicTools({
      requestContext: createRequestContext({
        projectPath: process.cwd(),
      }),
    });

    await expect(tools.custom_tool.execute({ foo: 'bar' }, {})).rejects.toThrow('boom');
    expect(hookManager.runPostToolUse).toHaveBeenCalledWith('custom_tool', { foo: 'bar' }, { error: 'boom' }, true);
  });
});
