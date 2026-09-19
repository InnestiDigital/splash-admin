/**
 * Run-level error codes — the machine-readable classification a turn surfaces
 * when the agent run itself fails (as opposed to a per-tool or per-stream
 * error). Consumed by the widget/app to decide retry vs. surface-and-stop.
 *
 * `RunErrorCodeSchema` is OPEN (forward-compatible): a newer runtime may emit a
 * code this consumer predates and it must still parse. Producers branch on the
 * known set below; see {@link ExtensibleCode}.
 */
import { z } from 'zod';
import type { ExtensibleCode } from './extensible-code.js';

/**
 * Known run error codes:
 * - `THREAD_BUSY` — a concurrent turn holds the session thread; the caller
 *   should back off and retry rather than treat this as fatal.
 * - `UNKNOWN_INTERRUPT` — the run parked on an interruption the resumer does not
 *   recognise (typically a contract skew between producer and consumer).
 * - `SEED_BUILD_ERROR` — the per-turn seed/context assembly failed before the
 *   model ran.
 * - `STRANDS_ERROR` — the underlying Strands agent loop threw.
 * - `ADAPTER_BUG` — an invariant the runtime→wire adapter is supposed to uphold
 *   was violated; a defect signal, not an expected runtime condition.
 */
export const RUN_ERROR_CODES = [
  'THREAD_BUSY',
  'UNKNOWN_INTERRUPT',
  'SEED_BUILD_ERROR',
  'STRANDS_ERROR',
  'ADAPTER_BUG',
] as const;

/** Closed enum of the known run error codes — for producer-side exhaustiveness. */
export const KnownRunErrorCodeSchema = z.enum(RUN_ERROR_CODES);
export type KnownRunErrorCode = z.infer<typeof KnownRunErrorCodeSchema>;

/**
 * Wire schema for a run error code — OPEN by design (`z.string()`, bounded).
 * Consumers branch on {@link RUN_ERROR_CODES} and treat anything else as a
 * generic, forward-compatible run failure.
 */
export const RunErrorCodeSchema = z.string().min(1).max(80);
export type RunErrorCode = ExtensibleCode<KnownRunErrorCode>;
