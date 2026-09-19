/**
 * Reasoning + citation envelope — the "planning reasoning alongside the prefill".
 *
 * Per prefilled field the wire carries WHY the value was chosen and WHERE it came
 * from, so the human reviewing the prefilled page (or the copilot plan) reads the
 * derivation and its source, not a bare value. ONE envelope, imported by both the
 * `/promoPlan` row and (later) the `/plan` step — never two near-duplicate shapes.
 *
 * Two sources, one shape (`source` discriminant):
 *   - `provenance` — the deterministic promo path. The prefill was built by pure
 *     code (`bucket-to-prefill.ts`) from a `BucketSourceRef`; `why` is a template,
 *     `citation` is the cell ref, `verified` is ASSERTED true (re-running
 *     `verifyCitation` on a deterministic copy is a tautology that can even
 *     false-negative on a transform like `0.08 → 8%`).
 *   - `model` — the general path. The model authored the value; `verified` is
 *     COMPUTED by `verifyCitation` (cell re-fetch) or recompute (`derived`), and
 *     CAN be false (rendered as an amber "unverified — check this" chip; never a
 *     gate, the human Saves regardless).
 *
 * A value with no machine-checkable source (e.g. chat-derived, or a general-path
 * cell before its retention store lands) carries `why` with NO `citation` — there
 * is no verified chip to fake. See docs/agents/admin.md.
 */
import { z } from 'zod';

/**
 * Where a value came from. NO `chat`/`prior_step` kind: chat spans have no
 * offset-stable retained anchor today, and a cross-step value resolves as an
 * ordinary re-read label (scope doc §4.4, §7).
 */
export const CitationSchema = z.discriminatedUnion('kind', [
  // File cell — same ref shape as `BucketSourceRef.ref` ("Big Spring!F2").
  z.object({ kind: z.literal('cell'), ref: z.string().min(1).max(80) }).strict(),
  // Computed with no single source — verified by recompute, not re-fetch.
  z.object({ kind: z.literal('derived') }).strict(),
]);
export type Citation = z.infer<typeof CitationSchema>;

export const FieldReasoningSchema = z
  .object({
    /** Dotted prefill path, e.g. "reactionGate.filters.0.amount". Opaque display. */
    field: z.string().min(1).max(60),
    /** Display value as prefilled (opaque, already stringified). */
    value: z.string().max(255),
    /** Why this value — deterministic template (provenance) OR model-authored. */
    why: z.string().min(1).max(300),
    /** Absent ⇒ no machine-checkable source (chat-derived / pre-store general path). */
    citation: CitationSchema.optional(),
    /** `verifyCitation` result; the provenance path ASSERTS true (never re-runs it). */
    verified: z.boolean(),
    /** provenance ⇒ verified always true; model ⇒ verified computed. */
    source: z.enum(['provenance', 'model']),
    /**
     * NON-GATING validator signal: the deterministic oracle value vs this
     * model-authored value. `match` ⇒ they agree, `mismatch` ⇒ they differ,
     * `no_oracle` ⇒ no deterministic value to compare against. Advisory corroboration
     * only — it NEVER flips `verified` and is NEVER a gate; the human Saves regardless.
     * Absent ⇒ no comparison was run (e.g. the deterministic provenance self).
     * Rides the wire as the per-field signal; the reviewer-facing disagreement
     * chip that renders it is a deferred widget surface (no consumer yet).
     */
    agreement: z.enum(['match', 'mismatch', 'no_oracle']).optional(),
  })
  .strict();
export type FieldReasoning = z.infer<typeof FieldReasoningSchema>;

/** Step/row-level review digest — the unit the wire carries. */
export const PlanStepProposalSchema = z
  .object({
    /** One-line summary, e.g. "Create promotion: All Avion 8%". */
    summary: z.string().min(1).max(200),
    fields: z.array(FieldReasoningSchema).max(40),
    /** Count of `verified === false` fields — one chip, no host re-derive. */
    unverifiedCount: z.number().int().min(0),
    /**
     * Summary digest mirroring `unverifiedCount`: count of fields whose `agreement`
     * is `mismatch` (deterministic oracle disagrees with the model value). A single
     * pre-derived count so the deferred reviewer chip needs no host re-derive.
     * Strictly advisory — NEVER a gate, never flips `verified`. Rides the wire
     * today; the chip that renders it is a deferred widget surface (no consumer yet).
     * Absent ⇒ no agreement comparison was run for this proposal.
     */
    disagreementCount: z.number().int().min(0).optional(),
  })
  .strict();
export type PlanStepProposal = z.infer<typeof PlanStepProposalSchema>;
