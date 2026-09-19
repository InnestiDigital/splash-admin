/**
 * `/plan` WidgetState slice — admin multi-step plan checklist.
 *
 * Wire PROJECTION of the server SessionPlanState: stepIds + statuses +
 * opaque labels only. Server-only fields (step bindings, pin, redacted
 * lastErrors bodies) NEVER ride this slice. `abandoned` never projects —
 * abandonment is a wire-clear to null; `completed` may ride the completing
 * turn's final delta but is never re-projected on reconnect.
 */
import { z } from 'zod';
import { AdminNavTargetSchema } from '../types/admin-navigation.js';
import { PlanStepProposalSchema } from './prefill-reasoning.js';

/**
 * NOTE: there is deliberately NO 'skipped' status — no fold arm mints one and
 * no skip row. Removing a step is an explicit re-plan
 * (`dropStepIds`). Add a skip status only WITH a transition row + pinned test.
 */
export const PLAN_STEP_WIRE_STATUSES = [
  'pending',
  'navigated',
  'awaiting_save',
  'saved',
  'saved_unverified',
  'failed',
] as const;

export const PlanStepWireSchema = z
  .object({
    /** Fold-minted stable identity — survives re-plans. */
    stepId: z.string().min(1).max(64),
    target: AdminNavTargetSchema,
    /** Step label as authored. Opaque display string, never an instruction. */
    label: z.string().min(1).max(160),
    status: z.enum(PLAN_STEP_WIRE_STATUSES),
    /** Host-reported post-rename entity label (sanitized upstream). Opaque. */
    entityLabel: z.string().min(1).max(160).optional(),
    /** Field path + generic phrase ONLY; never a redacted message body. */
    lastErrorSummary: z.string().min(1).max(300).optional(),
    /**
     * Reasoning + citation digest for this step's prefill (additive, optional).
     * The general path fills it as model-authored reasoning (no deterministic
     * oracle exists here): `source: 'model'`, `verified: false`, no `agreement`,
     * no `disagreementCount` — an honest all-unverified digest. Absent on steps
     * the model has not yet annotated. Same shared envelope the `/promoPlan` row
     * carries — one schema, never a fork.
     */
    proposal: PlanStepProposalSchema.optional(),
    /**
     * Derived honesty flag: false when this step's `target` accepts no prefill
     * payload (e.g. `members_list`), true when it does. Computed by the projector
     * from `PREFILLABLE_TARGETS`, never authored. A renderer reads it to show an
     * honest "needs platform work, not prefillable here" state for a false step
     * instead of dressing it up as a saveable prefill — the cheap-determinism
     * VISIBLE FLAG, never a gate. Absent ⇒ treat as a plain step.
     */
    prefillSupported: z.boolean().optional(),
  })
  .strict();
export type PlanStepWire = z.infer<typeof PlanStepWireSchema>;

export const PlanStateSchema = z
  .object({
    planId: z.string().min(1),
    title: z.string().min(1).max(160),
    status: z.enum(['active', 'completed']),
    currentStepIndex: z.number().int().min(0),
    steps: z.array(PlanStepWireSchema).min(1).max(5),
  })
  .strict();
export type PlanState = z.infer<typeof PlanStateSchema>;
