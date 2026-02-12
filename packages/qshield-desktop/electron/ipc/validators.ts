/**
 * IPC input validation using zod schemas.
 * All inputs from the renderer process MUST be validated before processing.
 * Never trust data from the renderer — it could be tampered with via DevTools.
 */
import { z, ZodError, type ZodSchema } from 'zod';

// ── Error class ──────────────────────────────────────────────────────────────

/** Structured validation error with machine-readable code and field path */
export class IpcValidationError extends Error {
  /** Machine-readable error code */
  readonly code: string;
  /** Dot-separated path to the invalid field, if applicable */
  readonly fieldPath: string | undefined;
  /** All validation issues (for multi-field errors) */
  readonly issues: Array<{ path: string; message: string }>;

  constructor(zodError: ZodError) {
    const firstIssue = zodError.issues[0];
    const fieldPath = firstIssue?.path.join('.') || undefined;
    const message = firstIssue
      ? `${fieldPath ? `${fieldPath}: ` : ''}${firstIssue.message}`
      : 'Validation failed';

    super(message);
    this.name = 'IpcValidationError';
    this.code = 'VALIDATION_ERROR';
    this.fieldPath = fieldPath;
    this.issues = zodError.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }
}

// ── Reusable primitives ──────────────────────────────────────────────────────

const uuidV4 = z.string().uuid('Must be a valid UUID v4');

const nonEmptyString = z.string().trim().min(1, 'Must be a non-empty string');

const adapterType = z.enum(['zoom', 'teams', 'email', 'file', 'api', 'crypto']);

const sortOrder = z.enum(['asc', 'desc']);

const safeFieldName = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Field name must be alphanumeric with underscores');

const configKey = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z][a-zA-Z0-9._-]*$/,
    'Config key must start with a letter, containing only alphanumeric, dots, dashes, or underscores',
  );

const safeUrl = z.string().url('Must be a valid URL').refine(
  (val) => {
    try {
      const u = new URL(val);
      return ['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol);
    } catch {
      return false;
    }
  },
  { message: 'URL must use http, https, ws, or wss protocol' },
);

// ── Channel input schemas ────────────────────────────────────────────────────

/** Schema for list/pagination options (evidence.list) */
export const listOptionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: safeFieldName.optional(),
  sortOrder: sortOrder.optional(),
  filter: z.record(z.unknown()).optional(),
});
export type ListOptionsInput = z.infer<typeof listOptionsSchema>;

/** Schema for evidence ID parameter */
export const evidenceIdSchema = uuidV4;

/** Schema for search query string */
export const searchQuerySchema = nonEmptyString.max(500, 'Search query must be 500 characters or fewer');

/** Schema for evidence export IDs array */
export const evidenceExportSchema = z
  .array(nonEmptyString)
  .min(1, 'At least one evidence ID is required')
  .max(1000, 'Cannot export more than 1000 records at once');

/** Schema for certificate generation options */
export const certOptionsSchema = z.object({
  sessionId: nonEmptyString,
  evidenceIds: z.array(uuidV4).optional(),
  includeAllEvidence: z.boolean().optional(),
});
export type CertOptionsInput = z.infer<typeof certOptionsSchema>;

/** Schema for gateway URL */
export const gatewayUrlSchema = safeUrl;

/** Schema for alert ID */
export const alertIdSchema = uuidV4;

/** Schema for adapter ID */
export const adapterIdSchema = adapterType;

/** Schema for config key */
export const configKeySchema = configKey;

/** Schema for policy configuration */
export const policyConfigSchema = z.object({
  rules: z.array(
    z.object({
      id: nonEmptyString,
      name: nonEmptyString,
      condition: z.object({
        signal: adapterType,
        operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq']),
        threshold: z.number().min(0).max(100),
      }),
      action: z.enum(['alert', 'escalate', 'freeze']),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      enabled: z.boolean(),
    }),
  ),
  escalation: z.object({
    channels: z.array(z.enum(['email', 'webhook', 'slack'])),
    webhookUrl: safeUrl.optional(),
    emailRecipients: z.array(z.string().email()).optional(),
    cooldownMinutes: z.number().int().min(1).max(1440),
  }),
  autoFreeze: z.object({
    enabled: z.boolean(),
    trustScoreThreshold: z.number().min(0).max(100),
    durationMinutes: z.number().int().min(1).max(1440),
  }),
});
export type PolicyConfigInput = z.infer<typeof policyConfigSchema>;

/** Supported crypto chains */
const cryptoChain = z.enum(['bitcoin', 'ethereum', 'solana', 'polygon', 'arbitrum', 'optimism']);

/** Schema for crypto address verification */
export const cryptoAddressSchema = z.object({
  address: nonEmptyString.max(128, 'Address must be 128 characters or fewer'),
  chain: cryptoChain,
});
export type CryptoAddressInput = z.infer<typeof cryptoAddressSchema>;

/** Schema for crypto transaction verification */
export const cryptoTransactionSchema = z.object({
  hash: nonEmptyString.max(128, 'Transaction hash must be 128 characters or fewer'),
  chain: cryptoChain,
});
export type CryptoTransactionInput = z.infer<typeof cryptoTransactionSchema>;

/** Schema for adding a trusted address */
export const cryptoAddressBookEntrySchema = z.object({
  address: nonEmptyString.max(128, 'Address must be 128 characters or fewer'),
  chain: cryptoChain,
  label: z.string().max(100, 'Label must be 100 characters or fewer').optional(),
});
export type CryptoAddressBookEntryInput = z.infer<typeof cryptoAddressBookEntrySchema>;

// ── Validator functions ──────────────────────────────────────────────────────

/**
 * Parse and validate input against a zod schema.
 * @throws {IpcValidationError} if validation fails
 */
export function validate<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new IpcValidationError(result.error);
  }
  return result.data;
}

/** Validate list/pagination options */
export function validateListOptions(input: unknown): ListOptionsInput {
  return validate(listOptionsSchema, input ?? {});
}

/** Validate a UUID string */
export function validateUuid(input: unknown, _fieldName?: string): string {
  return validate(uuidV4, input);
}

/** Validate a non-empty string */
export function validateString(input: unknown, _fieldName?: string): string {
  return validate(nonEmptyString, input);
}

/** Validate a search query */
export function validateSearchQuery(input: unknown): string {
  return validate(searchQuerySchema, input);
}

/** Validate evidence export IDs */
export function validateExportIds(input: unknown): string[] {
  return validate(evidenceExportSchema, input);
}

/** Validate certificate generation options */
export function validateCertOptions(input: unknown): CertOptionsInput {
  return validate(certOptionsSchema, input);
}

/** Validate a URL string */
export function validateUrl(input: unknown, _fieldName?: string): string {
  return validate(gatewayUrlSchema, input);
}

/** Validate an alert UUID */
export function validateAlertId(input: unknown): string {
  return validate(alertIdSchema, input);
}

/** Validate an adapter ID */
export function validateAdapterId(input: unknown): string {
  return validate(adapterIdSchema, input);
}

/** Validate a config key */
export function validateConfigKey(input: unknown): string {
  return validate(configKeySchema, input);
}

/** Validate a policy configuration object */
export function validatePolicyConfig(input: unknown): PolicyConfigInput {
  return validate(policyConfigSchema, input);
}

/** Validate crypto address verification input */
export function validateCryptoAddress(input: unknown): CryptoAddressInput {
  return validate(cryptoAddressSchema, input);
}

/** Validate crypto transaction verification input */
export function validateCryptoTransaction(input: unknown): CryptoTransactionInput {
  return validate(cryptoTransactionSchema, input);
}

/** Validate crypto address book entry input */
export function validateCryptoAddressBookEntry(input: unknown): CryptoAddressBookEntryInput {
  return validate(cryptoAddressBookEntrySchema, input);
}
