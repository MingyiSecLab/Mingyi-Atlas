import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PostHog } from 'posthog-node';
import { getAppDataDir } from './utils/project.js';

const POSTHOG_API_KEY = 'phc_SBLpZVAB6jmHOct9CABq3PF0Yn5FU3G2FgT4xUr2XrT';
const POSTHOG_HOST = 'https://us.posthog.com';
const MASTRA_SOURCE = 'mingyi-atlas';
const TRUTHY_DISABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const ANALYTICS_CONFIG_PATH = path.join(getAppDataDir(), 'analytics.json');

interface AnalyticsConfig {
  distinctId?: string;
}

function createMastraAnalyticsDistinctId(): string {
  return `mastra-${randomUUID()}`;
}

function isHostnameDerivedDistinctId(distinctId: string, hostname = os.hostname()): boolean {
  return distinctId === `mastra-${hostname}`;
}

function isValidMastraAnalyticsDistinctId(distinctId: string): boolean {
  return /^mastra-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(distinctId);
}

function writeAnalyticsConfig(distinctId: string, configPath = ANALYTICS_CONFIG_PATH): void {
  try {
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ distinctId }));
  } catch {
    // swallow analytics persistence errors
  }
}

export function getMastraAnalyticsDistinctId(configPath = ANALYTICS_CONFIG_PATH): string {
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as AnalyticsConfig;
      if (
        config.distinctId &&
        isValidMastraAnalyticsDistinctId(config.distinctId) &&
        !isHostnameDerivedDistinctId(config.distinctId)
      ) {
        return config.distinctId;
      }
    }
  } catch {
    // regenerate below
  }

  const distinctId = createMastraAnalyticsDistinctId();
  writeAnalyticsConfig(distinctId, configPath);
  return distinctId;
}

function isAnalyticsDebugEnabled(): boolean {
  return TRUTHY_DISABLED_VALUES.has(process.env.MINGYI_ATLAS_ANALYTICS_DEBUG?.trim().toLowerCase() ?? '');
}

function debugAnalytics(message: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsDebugEnabled()) {
    return;
  }

  const suffix = properties ? ` ${JSON.stringify(properties)}` : '';
  process.stderr.write(`[mingyi-atlas analytics] ${message}${suffix}\n`);
}

export type MingyiAtlasAnalyticsEvent =
  | 'mingyi-atlas_session_started'
  | 'mingyi-atlas_prompt_submitted'
  | 'mingyi-atlas_thread_changed'
  | 'mingyi-atlas_model_changed'
  | 'mingyi-atlas_command_used'
  | 'mingyi-atlas_interactive_prompt_shown';

export interface MingyiAtlasAnalytics {
  capture(event: MingyiAtlasAnalyticsEvent, properties?: Record<string, unknown>): void;
  trackCommand(command: string, properties?: Record<string, unknown>): void;
  trackInteractivePrompt(promptType: string, properties?: Record<string, unknown>): void;
  shutdown(): Promise<void>;
  isEnabled(): boolean;
}

interface MingyiAtlasAnalyticsOptions {
  version: string;
  host?: string;
  apiKey?: string;
}

class NoopMingyiAtlasAnalytics implements MingyiAtlasAnalytics {
  capture(event: MingyiAtlasAnalyticsEvent): void {
    debugAnalytics('capture skipped: telemetry disabled', { event });
  }
  trackCommand(command: string): void {
    debugAnalytics('command skipped: telemetry disabled', { command });
  }
  trackInteractivePrompt(promptType: string): void {
    debugAnalytics('interactive prompt skipped: telemetry disabled', { promptType });
  }
  async shutdown(): Promise<void> {
    debugAnalytics('shutdown skipped: telemetry disabled');
  }
  isEnabled(): boolean {
    return false;
  }
}

class PostHogMingyiAtlasAnalytics implements MingyiAtlasAnalytics {
  private readonly client: PostHog;
  private readonly distinctId: string;
  private readonly sessionId = randomUUID();
  private readonly version: string;

  constructor({ version, apiKey = POSTHOG_API_KEY, host = POSTHOG_HOST }: MingyiAtlasAnalyticsOptions) {
    this.version = version;
    this.distinctId = getMastraAnalyticsDistinctId();
    this.client = new PostHog(apiKey, {
      host,
      flushAt: 1,
      flushInterval: 0,
      disableGeoip: false,
    });
    this.client.register({ mastraSource: MASTRA_SOURCE });
    debugAnalytics('enabled', { host, distinctId: this.distinctId, version });
  }

  capture(event: MingyiAtlasAnalyticsEvent, properties?: Record<string, unknown>): void {
    try {
      const eventProperties = {
        ...this.getBaseProperties(),
        ...properties,
      };
      debugAnalytics('capture', { event, properties: eventProperties });
      this.client.capture({
        distinctId: this.distinctId,
        event,
        properties: eventProperties,
      });
    } catch (error) {
      debugAnalytics('capture failed', { event, error: error instanceof Error ? error.message : String(error) });
      // swallow analytics errors
    }
  }

  trackCommand(command: string, properties?: Record<string, unknown>): void {
    this.capture('mingyi-atlas_command_used', { command, ...properties });
  }

  trackInteractivePrompt(promptType: string, properties?: Record<string, unknown>): void {
    this.capture('mingyi-atlas_interactive_prompt_shown', { promptType, ...properties });
  }

  async shutdown(): Promise<void> {
    try {
      debugAnalytics('shutdown start');
      await this.client.shutdown();
      debugAnalytics('shutdown complete');
    } catch (error) {
      debugAnalytics('shutdown failed', { error: error instanceof Error ? error.message : String(error) });
      // swallow analytics errors
    }
  }

  isEnabled(): boolean {
    return true;
  }

  private getBaseProperties(): Record<string, unknown> {
    return {
      mastraSource: MASTRA_SOURCE,
      sessionId: this.sessionId,
      version: this.version,
      os: process.platform,
      osVersion: os.release(),
      nodeVersion: process.version,
      platform: process.arch,
      machineId: os.hostname(),
    };
  }
}

export function isTelemetryDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.MASTRA_TELEMETRY_DISABLED;
  if (!value) {
    return false;
  }

  return TRUTHY_DISABLED_VALUES.has(value.trim().toLowerCase());
}

export function createMingyiAtlasAnalytics(options: MingyiAtlasAnalyticsOptions): MingyiAtlasAnalytics {
  if (isTelemetryDisabled()) {
    debugAnalytics('disabled by MASTRA_TELEMETRY_DISABLED', { value: process.env.MASTRA_TELEMETRY_DISABLED });
    return new NoopMingyiAtlasAnalytics();
  }

  return new PostHogMingyiAtlasAnalytics(options);
}
