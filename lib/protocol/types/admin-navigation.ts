/**
 * Admin navigation — closed target catalog + the /pendingNavigation slice.
 *
 * The model NEVER emits a path or URL. It picks ONE `target` from this
 * closed enum; the host (podium_admin_v2) owns the target→Angular-route
 * map and never receives or trusts a path off the wire. This L0 module is the
 * SINGLE source the agent tool schema, the WidgetState slice, and the host all
 * import — one enum, no drift.
 *
 * Targets are PAGE-LEVEL only — no member/:id, no embedded ids, no path
 * fragment. A parameterized destination would re-open IDOR/enumeration and is
 * deliberately out of scope (a future typed slot validated server-side against
 * a trusted source, never a model string).
 *
 * EDIT (the `edit` slot below) is that typed slot, done safely: the model
 * supplies only a human LABEL (the name of the entity to edit), NEVER an id or
 * path. The host resolves that label to a concrete entity id SERVER-SIDE, under
 * the admin's own authenticated + program-scoped session — so the model can
 * never target an entity outside the admin's existing authority (no
 * IDOR/enumeration), and no id ever crosses the wire. The prefill rides along as
 * a DIFF (every prefill field is already optional) that the host patches over
 * the loaded entity for the admin to review and Save (same HITL as create).
 */
import { z } from 'zod';

import { AdminPrefillSchema } from './admin-prefill.js';

/** Closed catalog of admin destinations (page-level only). */
export const ADMIN_NAV_TARGETS = [
  'dashboard',
  'promotions_builder',
  'customer_segments',
  'members_list',
  'orders_list',
  'catalog_manager',
  'reports',
  'settings',
  'product_collections',
  'shop_configuration',
] as const;
export type AdminNavTarget = (typeof ADMIN_NAV_TARGETS)[number];
export const AdminNavTargetSchema = z.enum(ADMIN_NAV_TARGETS);

/**
 * `/pendingNavigation` WidgetState slice — a ONE-SHOT navigation directive
 * (a command, not durable display state). Parallels `/pendingCard`.
 *
 * `navId` is a stable per-directive id (a handler-minted UUID per directive,
 * server-side `crypto.randomUUID`) the host acks against so a STATE_SNAPSHOT
 * replay never re-fires the navigation. The slice is NEVER persisted to CAS and
 * is wire-cleared to `null` before RUN_FINISHED each turn — belt-and-suspenders
 * anti-replay.
 */
export const PendingNavigationStateSchema = z
  .object({
    target: AdminNavTargetSchema,
    /** Optional display-only caption ("Opening the promotions builder"). The host MUST NOT derive any navigation from it — only from `target`. */
    label: z.string().min(1).max(120).optional(),
    /** Stable per-directive id; the host acts once per new navId. */
    navId: z.string().min(1),
    /**
     * Server-minted opaque page-side correlation token. Accompanies a
     * create-prefill; the host stores it with the pending prefill and echoes
     * it VERBATIM in the save report; the resumer matches it. Match → `saved`;
     * mismatch/absent → `saved_unverified`. SEPARATE from navId.
     */
    correlationToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,64}$/)
      .optional(),
    /**
     * OPTIONAL typed form prefill. When present its `kind` MUST equal `target`.
     * Label-first values only; never a path. Host re-validates before patching
     * any form. For an EDIT navigation this is the DIFF (only the fields to
     * change) patched over the loaded entity.
     */
    prefill: AdminPrefillSchema.optional(),
    /**
     * OPTIONAL edit directive. Present => the host opens the EDIT page for the
     * entity of type `target` named `entityLabel`, resolving that label to a
     * concrete id SERVER-SIDE under the admin's own authenticated, program-scoped
     * session (never a model id, never a path). `entityLabel` is a human name
     * only — the same label-first contract every prefill vocab field uses. When
     * `edit` is present a `prefill` diff is REQUIRED (nothing to change
     * otherwise), and its `kind` still equals `target`.
     */
    edit: z
      .object({
        /** Human name of the entity to edit; host resolves to an id under the admin session. */
        entityLabel: z.string().min(1).max(160),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.prefill && value.prefill.kind !== value.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prefill', 'kind'],
        message: `prefill.kind '${value.prefill.kind}' must equal target '${value.target}'`,
      });
    }
    if (value.edit && !value.prefill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['edit'],
        message: 'an edit navigation requires a prefill diff (the fields to change)',
      });
    }
  });
export type PendingNavigationState = z.infer<typeof PendingNavigationStateSchema>;
