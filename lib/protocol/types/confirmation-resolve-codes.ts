/**
 * Confirmation-resolve outcome codes — the D6 frame-code vocabulary.
 *
 * The native resolve path (`POST /invoke`, kind:'confirmation') NEVER
 * surfaces HTTP statuses: the runtime adapter collapses every JSON
 * outcome into one in-stream SSE frame `event:'error'` with
 * `data:{code, message, ...extras, status?}`. Consumers (widget card
 * manager, admin copilot save reporter) branch on `code`; `status` is
 * advisory (present only when the resumer produced a JSON envelope).
 *
 * Single home for these codes. Producers: confirmation-resume +
 * runtime mappings/invocation. New resolve outcomes are APPENDED
 * here first.
 */
export const CONFIRMATION_RESOLVE_ERROR_CODES = [
  'CONFIRMATION_NOT_FOUND', // record/park missing, ownership denial (non-leak)
  'CONFIRMATION_EXPIRED', // lazy expiry
  'SESSION_VERSION_CONFLICT', // stale currentSessionVersion
  'TOKEN_MISMATCH', // resumeToken consistency check failed
  'INVALID_ADDRESS_SELECTION', // confirm with an id not on the original card
  'INVALID_ACTION_FOR_PARK_KIND', // action not allowed for this park kind
  'RESUME_IN_PROGRESS', // claimed, frames not yet cached
  'OUTCOME_CONFLICT', // already resolved by a DIFFERENT action/report
  'UNAUTHORIZED', // no verified identity on the invocation
  'INVALID_INVOCATION_PAYLOAD', // zod reject at the adapter
  'CONTRACT_VERSION_MISMATCH',
  'RESOLVE_INTERNAL_ERROR', // unexpected throw on the resolve seam (CAS exhaustion / Redis error) — transport-class, retryable; record untouched
  'INVALID_SAVE_REPORT', // save-report validation 409 (wrong navId/kind echo, missing/malformed report) — record untouched
] as const;

export type ConfirmationResolveErrorCode = (typeof CONFIRMATION_RESOLVE_ERROR_CODES)[number];
