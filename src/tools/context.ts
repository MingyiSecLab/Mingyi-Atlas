import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import {
  addPentestRetestItemQueued,
  getPentestContextPath,
  listPentestAssets,
  listPentestEndpoints,
  listPentestRetestQueue,
  listPentestScope,
  pentestAssetInputSchema,
  pentestEndpointInputSchema,
  pentestRetestItemInputSchema,
  pentestRetestItemUpdateSchema,
  pentestRetestStatusSchema,
  pentestScopeInputSchema,
  recordPentestAssetQueued,
  recordPentestEndpointQueued,
  recordPentestScopeQueued,
  updatePentestRetestItemQueued,
} from '../security/pentest/context.js';
import { resolvePentestProjectContext, setActivePentestTarget } from './pentest-target.js';

function resolveContextPath(context: any, targets: Array<string | undefined> = []): string {
  const { projectRoot, configDir, targetSlug } = resolvePentestProjectContext(context, targets);
  return getPentestContextPath(projectRoot, configDir, targetSlug);
}

export const recordScopeTool = createTool({
  id: 'record_scope',
  description: 'Record a user-authorized pentest scope target for later recon, validation, and reporting.',
  inputSchema: pentestScopeInputSchema,
  execute: async (input, context) => {
    const parsed = pentestScopeInputSchema.parse(input);
    setActivePentestTarget(context, parsed.target);
    return recordPentestScopeQueued(resolveContextPath(context, [parsed.target]), parsed);
  },
});

export const listScopeTool = createTool({
  id: 'list_scope',
  description: 'List recorded pentest scope targets.',
  inputSchema: z.object({}),
  execute: async (_input, context) => ({
    scope: listPentestScope(resolveContextPath(context)),
  }),
});

export const recordAssetTool = createTool({
  id: 'record_asset',
  description: 'Record a discovered pentest asset such as a host, service, URL, repository, package, or cloud resource.',
  inputSchema: pentestAssetInputSchema,
  execute: async (input, context) => recordPentestAssetQueued(resolveContextPath(context), input),
});

export const listAssetsTool = createTool({
  id: 'list_assets',
  description: 'List recorded pentest assets, optionally filtered by type.',
  inputSchema: z.object({
    type: pentestAssetInputSchema.shape.type.optional(),
  }),
  execute: async (input, context) => ({
    assets: listPentestAssets(resolveContextPath(context), input),
  }),
});

export const recordEndpointTool = createTool({
  id: 'record_endpoint',
  description: 'Record a discovered endpoint, route, API path, or web page for later analysis.',
  inputSchema: pentestEndpointInputSchema,
  execute: async (input, context) => recordPentestEndpointQueued(resolveContextPath(context), input),
});

export const listEndpointsTool = createTool({
  id: 'list_endpoints',
  description: 'List recorded endpoints, optionally filtered by method or auth requirement.',
  inputSchema: z.object({
    method: z.string().min(1).optional(),
    authRequired: z.boolean().optional(),
  }),
  execute: async (input, context) => ({
    endpoints: listPentestEndpoints(resolveContextPath(context), input),
  }),
});

export const addRetestItemTool = createTool({
  id: 'add_retest_item',
  description: 'Add a finding or remediation check to the pentest retest queue.',
  inputSchema: pentestRetestItemInputSchema,
  execute: async (input, context) => addPentestRetestItemQueued(resolveContextPath(context), input),
});

export const listRetestQueueTool = createTool({
  id: 'list_retest_queue',
  description: 'List pentest retest queue items, optionally filtered by status.',
  inputSchema: z.object({
    status: pentestRetestStatusSchema.optional(),
  }),
  execute: async (input, context) => ({
    retestQueue: listPentestRetestQueue(resolveContextPath(context), input),
  }),
});

export const updateRetestItemTool = createTool({
  id: 'update_retest_item',
  description: 'Update the status, steps, notes, or finding link for an existing retest queue item.',
  inputSchema: pentestRetestItemUpdateSchema,
  execute: async (input, context) => ({
    item: await updatePentestRetestItemQueued(resolveContextPath(context), input),
  }),
});

export function createContextTools() {
  return {
    record_scope: recordScopeTool,
    list_scope: listScopeTool,
    record_asset: recordAssetTool,
    list_assets: listAssetsTool,
    record_endpoint: recordEndpointTool,
    list_endpoints: listEndpointsTool,
    add_retest_item: addRetestItemTool,
    list_retest_queue: listRetestQueueTool,
    update_retest_item: updateRetestItemTool,
  };
}
