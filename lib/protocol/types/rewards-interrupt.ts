import { z } from 'zod';

/**
 * Safe display projection of a saved member address.
 *
 * The opaque id is the only value a client returns when resuming an interrupt.
 * Email, recipient names, street lines, and postal codes deliberately have no
 * representation here. Producers are responsible for ensuring `label` is the
 * same sanitized location-only caption they would show in the host UI.
 */
export const InterruptAddressOptionSchema = z
  .object({
    id: z.string().min(1).max(160),
    label: z.string().max(240).optional(),
    nickname: z.string().max(120).optional(),
    city: z.string().max(120).optional(),
    region: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .refine(
    (address) =>
      [address.label, address.nickname, address.city, address.region, address.country].some(
        (part) => typeof part === 'string' && part.trim().length > 0,
      ),
    { message: 'an interrupt address requires a safe display label or location' },
  );
export type InterruptAddressOption = z.infer<typeof InterruptAddressOptionSchema>;

export const OrderConfirmInterruptItemSchema = z
  .object({
    productId: z.string().min(1).max(160),
    productName: z.string().max(500),
    quantity: z.number().int().positive(),
    pricePoints: z.number().int().nonnegative(),
  })
  .strict();
export type OrderConfirmInterruptItem = z.infer<typeof OrderConfirmInterruptItemSchema>;

const expiresAtSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Native points-checkout review payload raised by `begin_checkout`. */
export const OrderConfirmInterruptReasonSchema = z
  .object({
    cardType: z.literal('order_confirm'),
    attemptId: z.string().min(1).max(160),
    expiresAt: expiresAtSchema,
    cartId: z.string().min(1).max(160),
    cartTotalPoints: z.number().int().positive(),
    availablePoints: z.number().int().nonnegative(),
    hasSplitpay: z.boolean(),
    cartItems: z.array(OrderConfirmInterruptItemSchema).min(1).max(100).readonly(),
    addresses: z.array(InterruptAddressOptionSchema).min(1).max(100).readonly(),
    defaultAddressId: z.string().min(1).max(160),
  })
  .strict()
  .refine(
    (reason) => reason.addresses.some((address) => address.id === reason.defaultAddressId),
    {
      path: ['defaultAddressId'],
      message: 'defaultAddressId must reference an address in the interrupt',
    },
  );
export type OrderConfirmInterruptReason = z.infer<typeof OrderConfirmInterruptReasonSchema>;

/**
 * Native eGift recipient-entry payload raised by `add_to_cart` on surfaces
 * with free-text input (membersite widget). Mirrors the membersite product
 * form: the member types the recipient's name and email; nothing is sourced
 * from the saved address book (Podium keeps eGift recipients as per-item
 * address rows, disjoint from the member's address book). The typed fields
 * ride the resume call, never this payload.
 */
export const RecipientEntryInterruptReasonSchema = z
  .object({
    cardType: z.literal('recipient_entry'),
    productName: z.string().max(500).optional(),
    /** Re-confirmation prefill echoed from an existing cart line, never PII-derived defaults. */
    prefill: z
      .object({
        firstName: z.string().max(120).optional(),
        lastName: z.string().max(120).optional(),
        email: z.string().max(254).optional(),
      })
      .strict()
      .optional(),
    expiresAt: expiresAtSchema,
  })
  .strict();
export type RecipientEntryInterruptReason = z.infer<typeof RecipientEntryInterruptReasonSchema>;

/** Closed native interrupt catalog supported by the member mobile surfaces. */
export const RewardsInterruptReasonSchema = z.discriminatedUnion('cardType', [
  OrderConfirmInterruptReasonSchema,
  RecipientEntryInterruptReasonSchema,
]);
export type RewardsInterruptReason = z.infer<typeof RewardsInterruptReasonSchema>;

/**
 * The interrupt card types a standalone surface (mobile/watch) can safely
 * render and resume. Single-sourced against {@link RewardsInterruptReason}:
 * the `satisfies` clause rejects any member outside the closed catalog, and
 * the exhaustiveness check below fails the build if the catalog gains a
 * member this list does not carry (or vice versa).
 */
export const STANDALONE_INTERRUPT_CARD_TYPES = [
  'order_confirm',
  'recipient_entry',
] as const satisfies readonly RewardsInterruptReason['cardType'][];
export type StandaloneInterruptCardType = (typeof STANDALONE_INTERRUPT_CARD_TYPES)[number];

/**
 * Compile-time both-directions exhaustiveness proof. Each `Exclude<>` must be
 * `never`; a drift in either direction turns one of them into a non-never
 * union and the aliases below stop type-checking.
 */
type ExhaustivenessProof<Missing extends never, Extra extends never> = [Missing, Extra];
export type StandaloneInterruptCardTypeExhaustiveness = ExhaustivenessProof<
  Exclude<RewardsInterruptReason['cardType'], StandaloneInterruptCardType>,
  Exclude<StandaloneInterruptCardType, RewardsInterruptReason['cardType']>
>;
