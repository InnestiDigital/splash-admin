/**
 * Canonical checkout outcome vocabulary.
 *
 * The runtime's `begin_checkout` tool (app/RewardsRuntime/src/domains/checkout.ts)
 * already returns exactly this `status` set informally; this module makes it the
 * shared, hand-mirrored source of truth for the web widget, the React Native app,
 * and the (later generated) watch surface.
 *
 * `CheckoutDispositionSchema` is a CLOSED enum — every terminal outcome is
 * enumerated. `CheckoutBlockedCodeSchema` is the OPEN, forward-compatible
 * sub-reason carried when the disposition is `blocked`; see
 * {@link ExtensibleCode}.
 */
import { z } from 'zod';
import type { ExtensibleCode } from './extensible-code.js';

/**
 * Terminal checkout dispositions:
 * - `confirmed` — order placed.
 * - `cancelled` — member declined the confirmation card.
 * - `timed_out` — the confirmation window expired before a confirm landed.
 * - `blocked` — a precondition failed; the specific reason rides
 *   `CheckoutBlockedCodeSchema`.
 * - `failed` — the downstream submit threw a definite failure.
 * - `unknown` — the downstream outcome is ambiguous (upstream timeout/unreachable
 *   with no idempotent reconciliation); the client must NOT assume success.
 * - `manual_checkout_required` — the flow must hand off to the host-owned
 *   checkout page instead of collecting payment inside the agent surface.
 */
export const CHECKOUT_DISPOSITIONS = [
  'confirmed',
  'cancelled',
  'timed_out',
  'blocked',
  'failed',
  'unknown',
  'manual_checkout_required',
] as const;

export const CheckoutDispositionSchema = z.enum(CHECKOUT_DISPOSITIONS);
export type CheckoutDisposition = z.infer<typeof CheckoutDispositionSchema>;

/**
 * Known `blocked` sub-reasons, mirrored from the runtime's checkout guards.
 * Producers switch on these; the tuple is exhaustive of today's known set.
 */
export const CHECKOUT_BLOCKED_CODES = [
  'CHECKOUT_CART_EMPTY',
  'CHECKOUT_TOTAL_UNAVAILABLE',
  'CHECKOUT_INSUFFICIENT_POINTS',
  'CHECKOUT_NO_ADDRESS',
  'CHECKOUT_ADDRESS_INVALID',
  'CHECKOUT_CART_CHANGED',
  'CHECKOUT_PAYMENT_METHOD_UNSUPPORTED',
  // A multi-storefront cart whose owning storefront cannot be proven — the
  // checkout must not guess which store the spend belongs to.
  'CHECKOUT_STOREFRONT_UNPROVEN',
] as const;

/** Closed enum of the known blocked codes — for producer-side exhaustiveness. */
export const KnownCheckoutBlockedCodeSchema = z.enum(CHECKOUT_BLOCKED_CODES);
export type KnownCheckoutBlockedCode = z.infer<typeof KnownCheckoutBlockedCodeSchema>;

/**
 * Wire schema for a blocked code — OPEN by design (`z.string()`, bounded): a
 * newer runtime guard may emit a code this consumer predates and it must still
 * parse. Consumers branch on {@link CHECKOUT_BLOCKED_CODES} and treat anything
 * else as a generic block.
 */
export const CheckoutBlockedCodeSchema = z.string().min(1).max(80);
export type CheckoutBlockedCode = ExtensibleCode<KnownCheckoutBlockedCode>;
