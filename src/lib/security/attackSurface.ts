export type AttackSurfaceKind =
  | 'page'
  | 'api'
  | 'form'
  | 'upload'
  | 'auth'
  | 'admin'
  | 'static-js'
  | 'callback'
  | 'target-group';

export type AttackSurfaceSource = 'blackbox' | 'whitebox' | 'manual';

export type AttackSurfaceParameterLocation = 'path' | 'query' | 'body' | 'header' | 'cookie';

export interface AttackSurfaceParameter {
  name: string;
  location: AttackSurfaceParameterLocation;
  example?: string;
}

export interface AttackSurfaceItem {
  id: string;
  target: string;
  method?: string;
  kind: AttackSurfaceKind;
  businessContext?: string;
  authRequired?: boolean;
  parameters?: AttackSurfaceParameter[];
  evidence?: string[];
  source: AttackSurfaceSource;
}

export interface SwarmTarget extends AttackSurfaceItem {
  objectives: string[];
  constraints?: string[];
}

export interface ObjectiveInferenceInput {
  target: string;
  method?: string;
  kind?: AttackSurfaceKind;
  businessContext?: string;
  authRequired?: boolean;
  parameters?: AttackSurfaceParameter[];
}

function normalizedText(input: ObjectiveInferenceInput): string {
  return [
    input.target,
    input.method,
    input.kind,
    input.businessContext,
    ...(input.parameters?.map(p => `${p.location}:${p.name}`) ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function includesAny(text: string, values: string[]): boolean {
  return values.some(value => text.includes(value));
}

function hasIdentityParameter(input: ObjectiveInferenceInput): boolean {
  return (input.parameters ?? []).some(parameter => {
    const name = parameter.name.toLowerCase();
    return name === 'id' || name.endsWith('id') || ['uuid', 'slug', 'order', 'user'].includes(name);
  });
}

function addObjective(objectives: string[], objective: string): void {
  if (!objectives.includes(objective)) objectives.push(objective);
}

export function inferTargetObjectives(input: ObjectiveInferenceInput): string[] {
  const text = normalizedText(input);
  const objectives: string[] = [];
  const method = input.method?.toUpperCase();

  if (input.kind === 'auth' || includesAny(text, ['login', 'signin', 'sign-in', 'session'])) {
    addObjective(objectives, 'Test authentication bypass');
    addObjective(objectives, 'Test user enumeration');
    addObjective(objectives, 'Test brute-force and rate-limit weakness');
    addObjective(objectives, 'Test session fixation');
  }

  if (includesAny(text, ['register', 'signup', 'sign-up'])) {
    addObjective(objectives, 'Test account creation abuse');
    addObjective(objectives, 'Test user enumeration');
    addObjective(objectives, 'Test weak verification or activation flow');
  }

  if (includesAny(text, ['password-reset', 'forgot-password', 'reset_password', 'reset-password'])) {
    addObjective(objectives, 'Test password reset token weakness');
    addObjective(objectives, 'Test account enumeration');
    addObjective(objectives, 'Test reset flow rate limiting');
  }

  if (input.kind === 'callback' || includesAny(text, ['oauth', 'callback', 'sso', 'saml'])) {
    addObjective(objectives, 'Test OAuth or SSO callback validation');
    addObjective(objectives, 'Test redirect URI and state handling');
    addObjective(objectives, 'Test account linking confusion');
  }

  if (input.kind === 'upload' || includesAny(text, ['upload', 'avatar', 'file', 'attachment'])) {
    addObjective(objectives, 'Test unrestricted file upload');
    addObjective(objectives, 'Test content-type bypass');
    addObjective(objectives, 'Test stored XSS through uploaded content');
    addObjective(objectives, 'Test path traversal in file handling');
  }

  if (includesAny(text, ['search', 'query', 'filter', 'lookup'])) {
    addObjective(objectives, 'Test reflected XSS');
    addObjective(objectives, 'Test SQL or NoSQL injection');
    addObjective(objectives, 'Test template injection');
  }

  if (includesAny(text, ['order', 'invoice', 'billing', 'checkout', 'payment', 'subscription'])) {
    addObjective(objectives, 'Test IDOR on business objects');
    addObjective(objectives, 'Test missing authorization');
    addObjective(objectives, 'Test tenant isolation');
    addObjective(objectives, 'Test sensitive data exposure');
    if (method && ['POST', 'PUT', 'PATCH'].includes(method)) {
      addObjective(objectives, 'Test mass assignment of owner, tenant, status, or price fields');
    }
  }

  if (includesAny(text, ['user', 'profile', 'account', 'email'])) {
    addObjective(objectives, 'Test horizontal authorization bypass');
    addObjective(objectives, 'Test profile or account data exposure');
    if (method && ['POST', 'PUT', 'PATCH'].includes(method)) {
      addObjective(objectives, 'Test unauthorized profile or account mutation');
    }
  }

  if (input.kind === 'admin' || includesAny(text, ['admin', 'moderator', 'manage', 'settings'])) {
    addObjective(objectives, 'Test admin access control bypass');
    addObjective(objectives, 'Test privilege escalation');
    addObjective(objectives, 'Test missing authorization on administrative actions');
  }

  if (input.kind === 'static-js' || includesAny(text, ['.js', 'bundle', 'app.js'])) {
    addObjective(objectives, 'Extract client-side routes and API endpoints');
    addObjective(objectives, 'Check for exposed sensitive secrets');
    addObjective(objectives, 'Identify client-side authorization assumptions');
  }

  if ((input.kind === 'api' || hasIdentityParameter(input)) && input.authRequired !== false) {
    addObjective(objectives, 'Test object-level authorization');
    addObjective(objectives, 'Test missing tenant isolation');
  }

  if (objectives.length === 0) {
    addObjective(objectives, 'Validate access control and authorization boundaries');
    addObjective(objectives, 'Test input handling for injection or XSS risks');
    addObjective(objectives, 'Check for sensitive data exposure');
  }

  return objectives;
}

export function toSwarmTarget(item: AttackSurfaceItem, objectives = inferTargetObjectives(item)): SwarmTarget {
  return {
    ...item,
    objectives,
  };
}
