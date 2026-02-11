/**
 * IPC input validation for all handlers.
 * All inputs from the renderer must be validated before processing.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Validate that a value is a non-empty string */
export function validateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

/** Validate that a value is a UUID v4 */
export function validateUuid(value: unknown, fieldName: string): string {
  const str = validateString(value, fieldName);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(str)) {
    throw new ValidationError(`${fieldName} must be a valid UUID v4`);
  }
  return str;
}

/** Validate list options (pagination) */
export function validateListOptions(value: unknown): {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('List options must be an object');
  }

  const opts = value as Record<string, unknown>;
  const page = typeof opts.page === 'number' && opts.page >= 1 ? Math.floor(opts.page) : 1;
  const pageSize =
    typeof opts.pageSize === 'number' && opts.pageSize >= 1 && opts.pageSize <= 100
      ? Math.floor(opts.pageSize)
      : 20;

  const result: { page: number; pageSize: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {
    page,
    pageSize,
  };

  if (typeof opts.sortBy === 'string' && opts.sortBy.length > 0) {
    // Only allow alphanumeric and underscore for sort field names
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(opts.sortBy)) {
      result.sortBy = opts.sortBy;
    }
  }

  if (opts.sortOrder === 'asc' || opts.sortOrder === 'desc') {
    result.sortOrder = opts.sortOrder;
  }

  return result;
}

/** Validate a URL string */
export function validateUrl(value: unknown, fieldName: string): string {
  const str = validateString(value, fieldName);
  try {
    const url = new URL(str);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      throw new ValidationError(`${fieldName} must use http, https, ws, or wss protocol`);
    }
    return str;
  } catch {
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

/** Validate a string array (e.g., evidence IDs for export) */
export function validateStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  return value.map((item, i) => validateString(item, `${fieldName}[${i}]`));
}

/** Validate policy config structure */
export function validatePolicyConfig(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Policy config must be an object');
  }

  const config = value as Record<string, unknown>;
  if (!Array.isArray(config.rules)) {
    throw new ValidationError('Policy config must have a rules array');
  }
  if (typeof config.escalation !== 'object' || config.escalation === null) {
    throw new ValidationError('Policy config must have an escalation object');
  }
  if (typeof config.autoFreeze !== 'object' || config.autoFreeze === null) {
    throw new ValidationError('Policy config must have an autoFreeze object');
  }

  return true;
}

/** Validate a config key (alphanumeric, dots, dashes) */
export function validateConfigKey(value: unknown): string {
  const str = validateString(value, 'config key');
  if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(str)) {
    throw new ValidationError('Config key must be alphanumeric with dots, dashes, or underscores');
  }
  return str;
}

/** Validate adapter ID */
export function validateAdapterId(value: unknown): string {
  const str = validateString(value, 'adapter ID');
  const validIds = ['zoom', 'teams', 'email', 'file', 'api'];
  if (!validIds.includes(str)) {
    throw new ValidationError(`Adapter ID must be one of: ${validIds.join(', ')}`);
  }
  return str;
}

/** Validate cert generation options */
export function validateCertOptions(value: unknown): {
  sessionId: string;
  evidenceIds?: string[];
  includeAllEvidence?: boolean;
} {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Certificate options must be an object');
  }

  const opts = value as Record<string, unknown>;
  const sessionId = validateString(opts.sessionId, 'sessionId');

  const result: { sessionId: string; evidenceIds?: string[]; includeAllEvidence?: boolean } = {
    sessionId,
  };

  if (Array.isArray(opts.evidenceIds)) {
    result.evidenceIds = opts.evidenceIds.map((id, i) => validateUuid(id, `evidenceIds[${i}]`));
  }

  if (typeof opts.includeAllEvidence === 'boolean') {
    result.includeAllEvidence = opts.includeAllEvidence;
  }

  return result;
}
