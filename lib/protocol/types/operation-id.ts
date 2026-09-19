/**
 * Opaque, server-derived operation identifier.
 *
 * An `operationId` is a PII-free correlation token: it links a client-visible
 * operation (a checkout attempt, a refresh action, a run) to server logs and
 * traces WITHOUT carrying any member data. It is always minted server-side; the
 * model never sees it and clients never fabricate one — they only echo it back.
 *
 * The character class is deliberately narrow (URL-safe, log-safe) so the token
 * can be embedded in paths, headers, and structured logs without escaping.
 */
import { z } from 'zod';

export const OperationIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, {
    message: 'operationId must be URL-safe: letters, digits, underscore, hyphen',
  });
export type OperationId = z.infer<typeof OperationIdSchema>;
