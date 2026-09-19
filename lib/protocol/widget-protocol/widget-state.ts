/**
 * Canonical AG-UI shared-state shape — single source of truth.
 *
 * `WidgetState` flows over the wire as `STATE_SNAPSHOT` and is mutated
 * via `STATE_DELTA` RFC 6902 JSON Patch ops. The producer (agent's
 * state-builder) and the consumer (widget's useAgUiState) both
 * import this module; neither declares its own copy. Drift is a
 * compile error, not a runtime surprise.
 *
 * `CardType` here is the 10-member WidgetState discriminator. The
 * widget's message/card union (packages/widget/src/features/
 * rewards-chatbot/types.ts) carries an extra `order_success` member
 * and is a DISTINCT type — intentionally not folded here.
 */

import { z } from 'zod';
import { KnowledgeResultSchema } from '../types/knowledge-result.js';
import { WhisperSchema, type Whisper } from '../types/whisper.js';
import { ADMIN_NAV_TARGETS, PendingNavigationStateSchema } from '../types/admin-navigation.js';
import { PREFILLABLE_TARGETS } from '../types/admin-prefill.js';
import { MemberNextActionsSchema } from './member-next-action.js';
import { PlanStateSchema } from './plan-state.js';
import { OrdersV2StateSchema } from './orders-v2.js';
import {
  StorefrontIdSchema,
  StorefrontLabelSchema,
  StorefrontRefSchema,
} from './storefront.js';

/**
 * Client-safe KB projection. `toolCallId` binds citations to the exact tool
 * result that produced them, so a later failed lookup cannot relabel stale
 * sources as evidence for a new answer. It is optional only for additive
 * decoding of snapshots emitted before the correlation field shipped.
 */
export const KnowledgeResultStateSchema = KnowledgeResultSchema.omit({ chunks: true })
  .extend({ toolCallId: z.string().min(1).optional() })
  .strict();
export type KnowledgeResultState = z.infer<typeof KnowledgeResultStateSchema>;

/** WidgetState card discriminator. */
export const CardTypeSchema = z.enum([
  'order_confirm',
  'mandate',
  'address_picker',
  'payment_split',
  'cancel_order',
  'phone_verify',
  'gifting',
  'sub_change',
  'awaiting_admin_save',
  // eGift recipient free-text entry (membersite-parity form). The typed
  // name/email ride the authenticated resume call, never the card payload.
  'recipient_entry',
]);
export type CardType = z.infer<typeof CardTypeSchema>;

/**
 * Canonical card registries — single-sourced from {@link CardTypeSchema}.
 *
 * INTERRUPT = the 10 WidgetState discriminator members: every card that can
 * arrive via a native Strands interrupt. DISPLAY = INTERRUPT plus the terminal
 * `order_success` receipt, which is display-only and NEVER arrives via an
 * interrupt. `CardTypeSchema` itself stays pinned at 10 members (the
 * widget-state schema test enforces it); `order_success` is additive here only.
 */
export const REWARDS_INTERRUPT_CARD_TYPES = CardTypeSchema.options;
export type RewardsInterruptCardType = CardType;

export const REWARDS_DISPLAY_CARD_TYPES = [...CardTypeSchema.options, 'order_success'] as const;
export type RewardsDisplayCardType = (typeof REWARDS_DISPLAY_CARD_TYPES)[number];

/**
 * Curated projected-card payload retained for state decoding. New form tools
 * use `AwaitingAdminSaveReasonSchema` so the native interruption also carries
 * the validated navigation directive.
 */
export const AwaitingAdminSavePayloadSchema = z
  .object({
    cardType: z.literal('awaiting_admin_save'),
    navId: z.string().min(1),
    target: z.enum(ADMIN_NAV_TARGETS),
    prefillKind: z.enum(PREFILLABLE_TARGETS),
  })
  .strict();
export type AwaitingAdminSavePayload = z.infer<typeof AwaitingAdminSavePayloadSchema>;

/**
 * Native Strands interruption reason for an admin form. The validated form
 * directive rides the interruption because `open_*_form` has not returned a
 * tool result when it parks.
 */
export const AwaitingAdminSaveReasonSchema = z
  .object({
    cardType: z.literal('awaiting_admin_save'),
    navId: z.string().uuid(),
    target: z.enum(ADMIN_NAV_TARGETS),
    prefillKind: z.enum(PREFILLABLE_TARGETS),
    expiresAt: z.number().int().positive(),
    pendingNavigation: PendingNavigationStateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.pendingNavigation.navId !== value.navId ||
      value.pendingNavigation.target !== value.target ||
      value.pendingNavigation.prefill?.kind !== value.prefillKind
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pendingNavigation'],
        message: 'admin-save interruption does not match its navigation directive',
      });
    }
  });
export type AwaitingAdminSaveReason = z.infer<typeof AwaitingAdminSaveReasonSchema>;

export const PendingCardStateSchema = z.object({
  id: z.string(),
  cardType: CardTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  resolveEndpoint: z.string(),
  parkedAt: z.number(),
  expiresAt: z.number(),
  sessionVersion: z.number(),
});
export type PendingCardState = z.infer<typeof PendingCardStateSchema>;

export const LastOrderStateSchema = z.object({
  orderId: z.string(),
  reference: z.string().optional(),
  status: z.string().optional(),
  totalPoints: z.number().optional(),
  itemsCount: z.number().optional(),
});
export type LastOrderState = z.infer<typeof LastOrderStateSchema>;

export const OrderItemStatusStateSchema = z.object({
  itemId: z.string(),
  productName: z.string().optional(),
  status: z.string(),
  quantity: z.number().optional(),
  pricePoints: z.number().optional(),
  trackingUrl: z.string().optional(),
  eta: z.string().optional(),
});
export type OrderItemStatusState = z.infer<typeof OrderItemStatusStateSchema>;

export const OrderStatusStateSchema = z.object({
  orderId: z.string(),
  placedAt: z.string().optional(),
  totalPoints: z.number().optional(),
  items: z.array(OrderItemStatusStateSchema),
});
export type OrderStatusState = z.infer<typeof OrderStatusStateSchema>;

/** PII-safe order row for native Activity surfaces. */
export const RecentOrderSummaryStateSchema = z
  .object({
    orderId: z.string(),
    reference: z.string().optional(),
    totalPoints: z.number().nonnegative().optional(),
    itemCount: z.number().int().nonnegative().optional(),
    currency: z.string().optional(),
    createdAt: z.string().optional(),
    canCancel: z.boolean().optional(),
  })
  .strict();
export type RecentOrderSummaryState = z.infer<typeof RecentOrderSummaryStateSchema>;

export const RecentOrdersStateSchema = z
  .object({
    items: z.array(RecentOrderSummaryStateSchema).max(50).readonly(),
    meta: z
      .object({
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        perPage: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type RecentOrdersState = z.infer<typeof RecentOrdersStateSchema>;

const PlainProductDescriptionSchema = z
  .string()
  .refine((value) => !/<\/?[a-z][^>]*>/iu.test(value), {
    message: 'product descriptions must be plain text, not HTML',
  })
  .refine((value) => !/(?:&amp;|&#\d+;|&#x[\da-f]+;|&[a-z][\da-z]+;)/iu.test(value), {
    message: 'product descriptions must contain decoded text, not HTML entities',
  });

/** Authoritative product detail for a native product owning screen. */
export const ProductDetailStateSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    category: z.string(),
    pricePoints: z.number().nonnegative(),
    originalPricePoints: z.number().positive().optional(),
    promotionEndDate: z.string().optional(),
    brand: z.string().optional(),
    imageUrl: z.string().optional(),
    slug: z.string().optional(),
    sku: z.string().optional(),
    productType: z.string().optional(),
    description: PlainProductDescriptionSchema.optional(),
    deepLink: z.string().url().optional(),
    // Optional for old persisted snapshots; current catalog results carry
    // authoritative program-vendor provenance.
    storefrontId: StorefrontIdSchema.optional(),
    storefrontLabel: StorefrontLabelSchema.optional(),
  })
  .strict();
export type ProductDetailState = z.infer<typeof ProductDetailStateSchema>;

/** Current deal vocabulary for a native Today/Discover surface. */
export const DealGroupStateSchema = z
  .object({
    groupCode: z.string(),
    groupName: z.string(),
    endDateUtc: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type DealGroupState = z.infer<typeof DealGroupStateSchema>;

export const DealGroupsStateSchema = z
  .object({ items: z.array(DealGroupStateSchema).readonly() })
  .strict();
export type DealGroupsState = z.infer<typeof DealGroupsStateSchema>;

export const CartItemStateSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  points: z.number(),
  quantity: z.number(),
  imageUrl: z.string().optional(),
  brand: z.string().optional(),
  /** eGift lines only: whether a recipient name+email has been saved server-side. */
  recipientCaptured: z.boolean().optional(),
});
export type CartItemState = z.infer<typeof CartItemStateSchema>;

export const CartStateSchema = z.object({
  items: z.array(CartItemStateSchema),
  totalPoints: z.number(),
  itemCount: z.number(),
});
export type CartState = z.infer<typeof CartStateSchema>;

/** A cart owned by exactly one Podium program-vendor storefront. */
export const ScopedCartStateSchema = z
  .object({
    cartId: z.string().min(1),
    storefrontId: StorefrontIdSchema,
    items: z.array(CartItemStateSchema).readonly(),
    totalPoints: z.number().nonnegative(),
    itemCount: z.number().int().nonnegative(),
  })
  .strict();
export type ScopedCartState = z.infer<typeof ScopedCartStateSchema>;

/**
 * Additive multi-storefront commerce read model. Carts remain separate: no
 * cross-storefront total or checkout is representable in the contract.
 */
export const CommerceStateSchema = z
  .object({
    storefronts: z.array(StorefrontRefSchema).max(50).readonly(),
    carts: z.array(ScopedCartStateSchema).max(50).readonly(),
    activeStorefrontId: StorefrontIdSchema.nullable(),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const storefrontIds = value.storefronts.map((storefront) => storefront.storefrontId);
    if (new Set(storefrontIds).size !== storefrontIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storefronts'],
        message: 'storefront identifiers must be unique',
      });
    }
    const cartIds = value.carts.map((cart) => cart.cartId);
    if (new Set(cartIds).size !== cartIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['carts'],
        message: 'cart identifiers must be unique',
      });
    }
    const cartStorefrontIds = value.carts.map((cart) => cart.storefrontId);
    if (new Set(cartStorefrontIds).size !== cartStorefrontIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['carts'],
        message: 'each storefront can own at most one cart',
      });
    }
    for (const [index, cart] of value.carts.entries()) {
      if (!storefrontIds.includes(cart.storefrontId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['carts', index, 'storefrontId'],
          message: 'cart must reference a listed storefront',
        });
      }
    }
    if (value.activeStorefrontId && !storefrontIds.includes(value.activeStorefrontId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeStorefrontId'],
        message: 'active storefront must reference a listed storefront',
      });
    }
  });
export type CommerceState = z.infer<typeof CommerceStateSchema>;

export const PointsBalanceStateSchema = z.object({
  status: z.enum(['unknown', 'ready']),
  value: z.number().optional(),
});
export type PointsBalanceState = z.infer<typeof PointsBalanceStateSchema>;

/**
 * Member summary slice — name + tier overview, populated only when the
 * model calls `get_member_summary`.
 *
 * Single-writer: `.strict()` so a `balance` key is REJECTED at the slice
 * level. Balance stays owned by `get_balance` → `/pointsBalance`; this
 * slice must never carry it, or two tools would write the member balance
 * and STATE_DELTA would flap.
 *
 * `unknown` exists only for schema symmetry with `pointsBalance` and is
 * pinned by a round-trip test. The mutator only ever emits
 * `{status:'ready', ...}` or leaves the slice; it NEVER emits
 * `{status:'unknown'}`.
 */
export const MemberSummaryStateSchema = z
  .object({
    status: z.enum(['unknown', 'ready']),
    name: z.string().optional(),
    tier: z.string().optional(),
  })
  .strict();
export type MemberSummaryState = z.infer<typeof MemberSummaryStateSchema>;

/**
 * Session-cumulative cost rollup slice — the single source of truth for
 * "what has this session cost so far". Accumulated by exactly ONE writer
 * (the agent widget-state mutator) off each `done.metrics`, mirroring
 * `memberSummary`'s single-writer discipline. The widget reads this
 * slice and NEVER re-derives dollars client-side (a stale client copy is
 * exactly the drift `bedrock-pricing.ts` exists to prevent).
 *
 * `.strict()` so an unexpected key is rejected at the slice level.
 * `costAvailable` is `true` for the session as long as every model turn
 * carried a cost (cache-blind 0s still count as available);
 * `cacheHitRatio` is the session-weighted ratio and is omitted until
 * there is at least one input token.
 */
export const CostRollupStateSchema = z
  .object({
    totalInputTokens: z.number(),
    totalOutputTokens: z.number(),
    totalCacheReadTokens: z.number(),
    totalCacheWriteTokens: z.number(),
    turns: z.number(),
    toolCalls: z.number(),
    estimatedCostUsd: z.number(),
    estimatedSavedUsd: z.number(),
    cacheHitRatio: z.number().optional(), // session-weighted (0..1) = totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens + totalCacheWriteTokens)
    costAvailable: z.boolean(),
  })
  .strict();
export type CostRollupState = z.infer<typeof CostRollupStateSchema>;

/**
 * Persistent earning-summary slice — folded from `get_earning_insights`
 * tool results and composed deterministically into the overview host
 * action. Every number is server-computed; `coverage: 'partial'` means
 * the window's history is incomplete and hosts must caption it as such.
 * `topEarningActivity` is an earning ACTIVITY TYPE (e.g. "Purchase"),
 * never merchant- or category-level data. `earnedPoints` is the gross
 * Purchase + Bonus split; signed adjustments/reversals affect only
 * `netEarnedPoints`. The optional split is all-or-none so older snapshots
 * remain readable without allowing a partially upgraded story.
 */
export const EarningSummaryStateSchema = z
  .object({
    netEarnedPoints: z.number(),
    period: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        timeZone: z.string().min(1),
      })
      .strict(),
    coverage: z.enum(['complete', 'partial']),
    earnProfile: z
      .object({ id: z.string().min(1), displayName: z.string().min(1) })
      .strict()
      .optional(),
    topEarningActivity: z
      .object({ label: z.string().min(1), points: z.number().nonnegative() })
      .strict()
      .nullable(),
    pacePointsPerWeek: z.number().nonnegative().nullable(),
    // Additive purchase/bonus split + aggregated sources for the "Earning
    // momentum" story. Optional so pre-split snapshots still parse.
    earnedPoints: z.number().nonnegative().optional(),
    purchasePoints: z.number().nonnegative().optional(),
    bonusPoints: z.number().nonnegative().optional(),
    topSources: z
      .array(
        z
          .object({
            label: z.string().min(1),
            points: z.number().nonnegative(),
            transactionCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(3)
      .optional(),
    observedAt: z.string().min(1),
  })
  .strict()
  .superRefine((summary, context) => {
    const split = [summary.earnedPoints, summary.purchasePoints, summary.bonusPoints];
    const providedSplitFields = split.filter((value) => value !== undefined).length;
    if (providedSplitFields !== 0 && providedSplitFields !== split.length) {
      context.addIssue({
        code: 'custom',
        message: 'gross earning split must be provided as one complete group',
        path: ['earnedPoints'],
      });
    } else if (
      providedSplitFields === split.length &&
      Math.abs(summary.earnedPoints! - summary.purchasePoints! - summary.bonusPoints!) > 0.01
    ) {
      context.addIssue({
        code: 'custom',
        message: 'earnedPoints must equal purchasePoints plus bonusPoints',
        path: ['earnedPoints'],
      });
    }
  });
export type EarningSummaryState = z.infer<typeof EarningSummaryStateSchema>;

/**
 * Persistent reward-affordability slice — folded from
 * `estimate_reward_timeline` results so the "when can I afford it"
 * answer survives as a card instead of dying with the transcript.
 * `estimatedWeeksMax: null` with status 'estimated' means the slow end
 * exceeds the ~10-year horizon; status 'beyond_horizon' means even the
 * fast end does. 'unavailable' results never project — the previous
 * timeline (if any) is preserved rather than replaced with nothing.
 */
export const RewardTimelineStateSchema = z
  .object({
    status: z.enum(['ready_now', 'estimated', 'beyond_horizon', 'insufficient_history']),
    product: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        pricePoints: z.number().nonnegative(),
        storefrontId: StorefrontIdSchema.optional(),
        storefrontLabel: StorefrontLabelSchema.optional(),
      })
      .strict(),
    currentPoints: z.number().nonnegative(),
    gapPoints: z.number().nonnegative(),
    estimatedWeeksMin: z.number().int().positive().nullable(),
    estimatedWeeksMax: z.number().int().positive().nullable(),
    paceCoverage: z.enum(['complete', 'partial']).nullable(),
    observedAt: z.string().min(1),
  })
  .strict();
export type RewardTimelineState = z.infer<typeof RewardTimelineStateSchema>;

export const CardHistoryEntrySchema = z.object({
  id: z.string(),
  cardType: CardTypeSchema,
  closedAt: z.number(),
  outcome: z.enum(['confirmed', 'cancelled', 'timed_out']),
});
export type CardHistoryEntry = z.infer<typeof CardHistoryEntrySchema>;

/** Whisper slot. Runtime validation reuses the canonical shared schema. */
export type WhisperEntry = Whisper;

/**
 * First-run bootstrap greeting (zero-LLM signals bootstrap). Set only by the
 * deterministic signals-bootstrap invoke on a member's first interaction; the
 * personalized suggestions themselves ride the existing `whispers` array, so
 * this slice stays minimal — just the greeting line.
 */
export const FirstRunStateSchema = z.object({ greeting: z.string() }).strict();
export type FirstRunState = z.infer<typeof FirstRunStateSchema>;

export const WidgetStateSchema = z.object({
  pendingCard: PendingCardStateSchema.nullable(),
  lastOrder: LastOrderStateSchema.nullable(),
  pointsBalance: PointsBalanceStateSchema,
  cart: CartStateSchema.nullable(),
  cardHistory: z.array(CardHistoryEntrySchema).readonly(),
  whispers: z.array(WhisperSchema).readonly(),
  orderStatus: OrderStatusStateSchema.nullable(),
  recentOrders: RecentOrdersStateSchema.nullable(),
  productDetail: ProductDetailStateSchema.nullable(),
  dealGroups: DealGroupsStateSchema.nullable(),
  // `memberSummary` diverges from `pointsBalance` intentionally: it is
  // `.nullable()` defaulting to `null`, whereas `pointsBalance` is a
  // first-class always-present concept defaulting to {status:'unknown'}.
  // Rationale: member summary is an OPTIONAL late-arriving slice, only
  // populated when the model calls `get_member_summary`. The single
  // "absent" representation is `null`; the mutator never emits
  // {status:'unknown'}.
  memberSummary: MemberSummaryStateSchema.nullable(),
  // Session-cumulative cost rollup. Same `.nullable()` / default-null
  // shape as `memberSummary`: an optional late-arriving slice, `null`
  // until the first `done.metrics` lands.
  costRollup: CostRollupStateSchema.nullable(),
  // One-shot admin navigation directive. `.nullable()` default null,
  // mirroring `pendingCard`. NEVER persisted to CAS and wire-cleared to null
  // before RUN_FINISHED each turn — a command, not durable display state.
  pendingNavigation: PendingNavigationStateSchema.nullable(),
  // Admin plan checklist. `.nullable()` default null. Projection rules live
  // server-side (plan-project.ts): active-only on reconnect, pin-checked;
  // abandon = wire-clear to null.
  plan: PlanStateSchema.nullable(),
  // Normalized orders read model (roadmap B1). Additive and optional-with-
  // `.default(null)`: a pre-B1 snapshot that omits the key still parses (the
  // default fills it with null), so old persisted CAS payloads stay valid.
  // Populated on a host-action refresh (roadmap B2) and preserved across
  // model turns via the inbound-state spread.
  ordersV2: OrdersV2StateSchema.nullable().default(null),
  // Persistent earning surfaces. Additive with `.default(null)` like
  // ordersV2 so pre-earning snapshots (and old CAS payloads) still parse.
  earningSummary: EarningSummaryStateSchema.nullable().default(null),
  rewardTimeline: RewardTimelineStateSchema.nullable().default(null),
  // Multi-storefront carts. Additive/default-null keeps persisted snapshots
  // from before storefront support readable. `cart` remains the temporary
  // active/default-storefront projection for older clients.
  commerce: CommerceStateSchema.nullable().default(null),
  // Latest KB retrieval disposition and safe HTTPS sources. Retrieved chunk
  // text stays inside the runtime/model boundary; native hosts need only the
  // grounding status and citations.
  knowledgeResult: KnowledgeResultStateSchema.nullable().default(null),
  // Server-ranked deterministic continuations. Labels remain host-localized;
  // these closed action kinds carry only the minimum verified arguments.
  nextActions: MemberNextActionsSchema.default([]),
  // First-run bootstrap greeting. Additive `.default(null)` like ordersV2 /
  // commerce so pre-bootstrap snapshots (and old CAS payloads) still parse.
  // Populated only by the signals-bootstrap invoke; suggestions ride `whispers`.
  firstRun: FirstRunStateSchema.nullable().default(null),
});
export type WidgetState = z.infer<typeof WidgetStateSchema>;

export const EMPTY_WIDGET_STATE: WidgetState = Object.freeze({
  pendingCard: null,
  lastOrder: null,
  pointsBalance: Object.freeze({ status: 'unknown' }) as PointsBalanceState,
  cart: null,
  cardHistory: Object.freeze([]) as ReadonlyArray<CardHistoryEntry>,
  whispers: Object.freeze([]) as ReadonlyArray<WhisperEntry>,
  orderStatus: null,
  recentOrders: null,
  productDetail: null,
  dealGroups: null,
  memberSummary: null,
  costRollup: null,
  pendingNavigation: null,
  plan: null,
  ordersV2: null,
  earningSummary: null,
  rewardTimeline: null,
  commerce: null,
  knowledgeResult: null,
  nextActions: Object.freeze([]),
  firstRun: null,
}) as WidgetState;
