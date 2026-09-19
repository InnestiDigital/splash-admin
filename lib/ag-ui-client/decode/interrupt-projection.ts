import type { SSEEvent } from '../../protocol/index.js';

// The ONE interrupt wire parser. Both member surfaces used to walk the
// RUN_FINISHED outcome frame themselves (web useActiveCard, mobile
// lib/interrupt); this module is now the single decode of that frame shape.
// It is deliberately DISPOSITION-FREE: it projects what the wire carried
// (id / cardType / payload / expiry) and each surface applies its own card
// policy (web: CONFIRMATION card set; mobile: STANDALONE interrupt catalog).
//
// Interrupts are inferred ONLY from a delivered RUN_FINISHED outcome frame —
// never from RUN_ERROR, stream close, or client-side pendingInterrupts
// bookkeeping. The ag-ui adapter 0.2.3 stops silently without a RUN_FINISHED
// frame in some limit paths; durable mobile interrupts depend on that
// distinction staying loud.

/** Wire-projected pending interrupt. Untrusted: `payload` has NOT passed a card schema. */
export interface PendingInterruptProjection {
  /** `''` when the wire entry carried no usable string id. */
  readonly interruptId: string;
  /** `payload.cardType` when it is a string; `null` otherwise. */
  readonly cardType: string | null;
  /**
   * Decoded `message` (falling back to `reason`) body: a JSON string is
   * parsed, an already-structured object passes through, anything else
   * (including unparseable JSON) projects as `null`.
   */
  readonly payload: Record<string, unknown> | null;
  /**
   * Epoch milliseconds. A finite numeric `payload.expiresAt` wins over the
   * protocol-level ISO `expiresAt` (parsed via `Date.parse`); unparseable or
   * absent values project as `null`.
   */
  readonly expiresAt: number | null;
  readonly receivedAt: number;
}

export type InterruptProjectionEvent =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'pending';
      /** Projection of the FIRST interrupt on the outcome frame. */
      readonly projection: PendingInterruptProjection;
      /**
       * Raw interrupt count on the outcome frame. Both member surfaces treat
       * anything other than exactly 1 as a protocol violation; the count is
       * surfaced so each keeps its own rejection wording.
       */
      readonly interruptCount: number;
    };

const NO_INTERRUPT: InterruptProjectionEvent = { kind: 'none' };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Tolerant JSON parse — returns `null` instead of throwing on bad input. */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function payloadOf(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') return record(parseJson(raw));
  return record(raw);
}

function expirationOf(
  payload: Record<string, unknown> | null,
  protocolValue: unknown,
): number | null {
  const payloadValue = payload?.['expiresAt'];
  if (typeof payloadValue === 'number' && Number.isFinite(payloadValue)) return payloadValue;
  if (typeof protocolValue !== 'string' || protocolValue.length === 0) return null;
  const parsed = Date.parse(protocolValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectionOf(entry: unknown): PendingInterruptProjection {
  const receivedAt = Date.now();
  const interrupt = record(entry);
  if (!interrupt) {
    return { interruptId: '', cardType: null, payload: null, expiresAt: null, receivedAt };
  }
  const id = interrupt['id'];
  const payload = payloadOf(interrupt['message'] ?? interrupt['reason']);
  const cardType = payload?.['cardType'];
  return {
    interruptId: typeof id === 'string' ? id : '',
    cardType: typeof cardType === 'string' ? cardType : null,
    payload,
    expiresAt: expirationOf(payload, interrupt['expiresAt']),
    receivedAt,
  };
}

/**
 * Typed-SDK entry point: project the `interrupts` array delivered by the
 * official client's `onRunFinishedEvent` interrupt outcome.
 */
export function projectInterruptFromRunFinished(
  officialInterrupts: readonly unknown[],
): InterruptProjectionEvent {
  if (officialInterrupts.length === 0) return NO_INTERRUPT;
  return {
    kind: 'pending',
    projection: projectionOf(officialInterrupts[0]),
    interruptCount: officialInterrupts.length,
  };
}

/**
 * Raw-frame entry point: project a wire SSE event. Anything that is not a
 * parseable RUN_FINISHED interrupt outcome carrying at least one interrupt
 * projects as `{ kind: 'none' }`.
 */
export function projectInterrupts(event: SSEEvent): InterruptProjectionEvent {
  if (event.event !== 'RUN_FINISHED') return NO_INTERRUPT;
  const frame = record(parseJson(event.data));
  const outcome = record(frame?.['outcome']);
  if (outcome?.['type'] !== 'interrupt') return NO_INTERRUPT;
  const interrupts = outcome['interrupts'];
  if (!Array.isArray(interrupts)) return NO_INTERRUPT;
  return projectInterruptFromRunFinished(interrupts);
}
