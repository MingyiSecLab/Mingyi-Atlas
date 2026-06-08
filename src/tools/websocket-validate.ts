import { performance } from 'node:perf_hooks';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { isWebSocketUrl, MAX_MESSAGE_CHARS, rejectOutOfScope, scopeInput } from './api-validation-utils.js';

const websocketInputSchema = z.object({
  url: z.string().url().refine(isWebSocketUrl, 'URL must be ws:// or wss://.'),
  message: z.string().max(MAX_MESSAGE_CHARS).optional().describe('Optional single benign message to send after connection.'),
  headers: z.record(z.string(), z.string()).default({}),
  ...scopeInput,
});

export const websocketValidateTool = createTool({
  id: 'websocket_validate',
  description: `Open a scoped WebSocket connection and optionally send one benign message.

Use for handshake validation and protocol/auth checks. This tool does not fuzz or brute force WebSocket endpoints.`,
  inputSchema: websocketInputSchema,
  execute: async (input, context) => {
    const parsed = websocketInputSchema.parse(input);
    const httpEquivalent = parsed.url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    const scopeError = rejectOutOfScope(httpEquivalent, context, parsed.scopeHosts);
    if (scopeError) return { ...scopeError, url: parsed.url };

    const WebSocketCtor = (globalThis as any).WebSocket;
    if (!WebSocketCtor) {
      return { success: false, error: 'websocket_unavailable', message: 'Runtime does not expose global WebSocket.' };
    }

    return await new Promise<any>(resolve => {
      const start = performance.now();
      const ws = new WebSocketCtor(parsed.url, { headers: parsed.headers });
      const messages: string[] = [];
      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore close failures
        }
        resolve({ success: false, error: 'timeout', message: `WebSocket timed out after ${parsed.timeoutMs}ms.`, messages });
      }, parsed.timeoutMs);

      ws.addEventListener('open', () => {
        if (parsed.message) ws.send(parsed.message);
        if (!parsed.message) {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: true, opened: true, messages, elapsedMs: Math.round(performance.now() - start) });
        }
      });
      ws.addEventListener('message', (event: any) => {
        messages.push(String(event.data).slice(0, MAX_MESSAGE_CHARS));
        clearTimeout(timeout);
        ws.close();
        resolve({ success: true, opened: true, messages, elapsedMs: Math.round(performance.now() - start) });
      });
      ws.addEventListener('error', () => {
        clearTimeout(timeout);
        resolve({ success: false, error: 'connection_failed', messages, elapsedMs: Math.round(performance.now() - start) });
      });
    });
  },
});
