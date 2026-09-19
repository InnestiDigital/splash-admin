/**
 * SSE error codes. REST error responses (ErrorResponse) use a separate
 * type on a separate channel — they share the same `{ error, code }`
 * shape but their code namespaces may diverge.
 */

/**
 * Machine-readable SSE error codes for stream-level error classification.
 *
 * Kept to the codes that actually have a producer or consumer today:
 * `PARSE_ERROR` is emitted by this package's own `parseSSEFrame` when the
 * wire delivers malformed JSON; `AGENT_ERROR` / `INTERNAL_ERROR` are the
 * generic catch-alls used by the runtime's error paths. Former members
 * `SESSION_NOT_FOUND` / `TURN_TIMEOUT` / `MAX_TOOL_CALLS` /
 * `AGENT_RETURN_CONTROL_UNSUPPORTED` were removed as dead: grepping the
 * whole repo found zero producers and zero consumers, and the concept
 * each named (e.g. the tool-call-loop guard) is surfaced through a
 * different mechanism today (`ToolLoopExceeded` → HardGuard cancel
 * string, not an SSE error code).
 */
export const SSE_ERROR_CODES = {
  AGENT_ERROR: 'AGENT_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR', // shared with REST namespace
} as const;
