import { z } from 'zod';
import { HostSaveReportSchema } from './host-save-report.js';

/**
 * The confirmation-resolve body on the `kind:'confirmation'` invocation.
 * SINGLE wire definition shared across producers.
 *
 * Identity NEVER rides this body — the runtime constructs the caller
 * exclusively from the customJWTAuthorizer-verified agent token. The schema is
 * deliberately NON-strict so a stale client still sending `tenantContext`
 * parses (the key is stripped and ignored) and fails closed on identity instead
 * of on shape.
 *
 * `host_save_ok` / `host_save_failed` are the admin-save resolution
 * actions; they carry a `saveReport` (required iff the action is a save,
 * forbidden for `confirm`/`cancel`). Polarity rides the action — the
 * report itself has no `ok` field.
 */
export const ConfirmationBodySchema = z
  .object({
    sessionId: z.string().min(1),
    confirmationId: z.string().min(1),
    action: z.enum(['confirm', 'cancel', 'host_save_ok', 'host_save_failed']),
    currentSessionVersion: z.number().int().nonnegative(),
    contractVersion: z.string().min(1),
    selectedAddressId: z.string().optional(),
    saveReport: HostSaveReportSchema.optional(),
    debugTrace: z.boolean().optional(),
    /** AG-UI is the only wire format; optional literal. */
    protocol: z.literal('ag-ui').optional(),
  })
  .superRefine((body, ctx) => {
    const isSave = body.action === 'host_save_ok' || body.action === 'host_save_failed';
    if (isSave && body.saveReport === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['saveReport'],
        message: 'saveReport required for host_save_* actions',
      });
    }
    if (!isSave && body.saveReport !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['saveReport'],
        message: 'saveReport forbidden for confirm/cancel',
      });
    }
  });

export type ConfirmationBody = z.infer<typeof ConfirmationBodySchema>;
