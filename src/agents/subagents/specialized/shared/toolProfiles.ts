import { MC_TOOLS } from '../../../../tool-names.js';

import { PENTEST_SKILL_TOOLS } from './skillTools.js';

export const PENTEST_OFFLINE_ANALYSIS_TOOLS = ['crypto_analyze', 'hash_analyze'] as const;

export const PENTEST_CONTEXT_TOOLS = [
  'record_scope',
  'list_scope',
  'record_asset',
  'list_assets',
  'record_endpoint',
  'list_endpoints',
  'add_retest_item',
  'list_retest_queue',
  'update_retest_item',
] as const;

export const PENTEST_FINDING_TOOLS = ['report_finding', 'list_findings', 'get_finding', 'update_finding'] as const;

export const PENTEST_DISCOVERY_TOOLS = [
  ...PENTEST_OFFLINE_ANALYSIS_TOOLS,
  'http_request',
  'extract_js_endpoints',
  'detect_auth_scheme',
  'detect_captcha',
  'validate_discovery',
  'cve_search',
] as const;

export const PENTEST_API_AUTH_TOOLS = [
  ...PENTEST_OFFLINE_ANALYSIS_TOOLS,
  'http_request',
  'graphql_validate',
  'websocket_validate',
  'jwt_analyze',
  'oauth_validate',
  'request_smuggling_assess',
] as const;

export const PENTEST_BROWSER_TOOLS = ['run_browser_cli'] as const;

export const PENTEST_VULN_VALIDATION_TOOLS = [
  ...PENTEST_API_AUTH_TOOLS,
  'sqli_probe',
  'ssti_probe',
  'ssrf_probe',
  'xxe_probe',
] as const;

export const TOOL_PROFILE_SKILLS = [...PENTEST_SKILL_TOOLS] as const;

export const TOOL_PROFILE_READONLY = [
  MC_TOOLS.VIEW,
  MC_TOOLS.SEARCH_CONTENT,
  MC_TOOLS.FIND_FILES,
  MC_TOOLS.LSP_INSPECT,
  ...TOOL_PROFILE_SKILLS,
] as const;

export const TOOL_PROFILE_ATTACK_SURFACE = [
  ...TOOL_PROFILE_READONLY,
  ...PENTEST_DISCOVERY_TOOLS,
  ...PENTEST_CONTEXT_TOOLS,
] as const;

export const TOOL_PROFILE_AUTH = [
  ...TOOL_PROFILE_READONLY,
  ...PENTEST_API_AUTH_TOOLS,
  ...PENTEST_BROWSER_TOOLS,
  'detect_auth_scheme',
  'detect_captcha',
  ...PENTEST_CONTEXT_TOOLS,
] as const;

export const TOOL_PROFILE_VALIDATION = [
  MC_TOOLS.VIEW,
  MC_TOOLS.SEARCH_CONTENT,
  MC_TOOLS.FIND_FILES,
  ...TOOL_PROFILE_SKILLS,
  ...PENTEST_VULN_VALIDATION_TOOLS,
  ...PENTEST_BROWSER_TOOLS,
  ...PENTEST_CONTEXT_TOOLS,
  ...PENTEST_FINDING_TOOLS,
] as const;

export const TOOL_PROFILE_FINDING_JUDGE = [
  MC_TOOLS.VIEW,
  MC_TOOLS.SEARCH_CONTENT,
  MC_TOOLS.FIND_FILES,
  ...TOOL_PROFILE_SKILLS,
  'http_request',
  ...PENTEST_FINDING_TOOLS,
] as const;
