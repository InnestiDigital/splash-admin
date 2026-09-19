import { z } from 'zod';

/**
 * Per-target prefill payloads for navigate-with-prefill.
 * CLOSED discriminated union; every variant `.strict()`. LABEL-FIRST: the
 * model references vocabulary by human-meaningful label, NEVER by id — the
 * host resolves labels against the page's freshly loaded vocabulary and
 * drops what doesn't resolve (fail-soft, reported to the human). Values
 * only; never a path, URL, or route fragment. `kind` mirrors the
 * AdminNavTarget it prefills; the slice schema enforces kind === target.
 */

/** Matches podium's `frequency` rule: ISO-8601 duration (e.g. P1W, P3M). */
const ISO8601_DURATION = /^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/;

const label = z.string().min(1).max(160);

/** One flat segment rule (v1: no nested groups). */
export const SegmentPrefillRuleSchema = z
  .object({
    /** Filter label as shown to admins; host resolves to segment_filters.id. */
    filterLabel: label,
    // Exact page tokens (getQueryFilters). A closed enum fails a bad operator
    // at the tool boundary where the model can retry — observed live: 'since'
    // slipped a string schema and died as a silent host-side rule drop.
    operator: z.enum(['equal', 'not_equal', 'greater', 'greater_or_equal', 'less', 'less_or_equal']),
    value: z.string().min(1).max(255),
  })
  .strict();

export const SegmentPrefillSchema = z
  .object({
    kind: z.literal('customer_segments'),
    name: z.string().min(1).max(255).optional(),
    type: z.enum(['fixed', 'automatic', 'customer-fixed']).optional(),
    rules: z
      .object({
        gate: z.enum(['AND', 'OR']),
        rules: z.array(SegmentPrefillRuleSchema).min(1).max(20),
      })
      .strict()
      .optional(),
  })
  .strict();

const collectionScope = z
  .object({ rewardType: z.literal('collection'), collectionLabel: label })
  .strict();
const brandScope = z.object({ rewardType: z.literal('brand'), brandLabel: label }).strict();
const productScope = z
  .object({
    rewardType: z.literal('product'),
    /**
     * Raw SKU strings — podium resolves & rejects invalid ones by name. Podium
     * enforces NO hard SKU limit (no validation max, TEXT column, one row per
     * SKU); the 500 cap covers every real promo-import bucket (seen up to 98
     * SKUs) with headroom while staying under podium's only practical bound
     * (per-SKU insert latency above ~500-1000).
     */
    skus: z.array(z.string().min(1).max(64)).min(1).max(500),
    /** REQUIRED with SKUs (PromotionStore pairing rule). */
    supplierLabel: label,
  })
  .strict();
const attributeScope = z
  .object({
    rewardType: z.literal('attribute'),
    attributeLabel: label,
    attributeValue: z.string().min(1).max(255),
  })
  .strict();

/** Scope = WHICH entities a gate filter applies to (podium reward types). */
export const PromotionScopeSchema = z.discriminatedUnion('rewardType', [
  collectionScope,
  brandScope,
  productScope,
  attributeScope,
]);

/**
 * Scopes legal inside CHILD gates: podium's child value_name whitelist omits
 * supplier_id (ActionGateChildrenValidator), and a product/SKU scope cannot
 * be stored without its supplier — so the SKU+supplier pair is
 * root-gate-only and children get the narrowed union.
 */
const PromotionChildScopeSchema = z.discriminatedUnion('rewardType', [
  collectionScope,
  brandScope,
  attributeScope,
]);

const nothingFilter = z.object({ action: z.literal('nothing') }).strict();
const spendTodayFilter = z
  .object({
    action: z.literal('spend_today'),
    amount: z.number().positive(),
    currencyLabel: label.optional(),
  })
  .strict();
const memberRegistrationFilter = z
  .object({
    action: z.literal('member_registration'),
    registrationStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    registrationEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
  .refine((v) => v.registrationEnd >= v.registrationStart, { message: 'end before start' });

/** One action condition (podium's closed action_type catalog). */
export const PromotionActionFilterSchema = z.discriminatedUnion('action', [
  nothingFilter,
  z.object({ action: z.literal('buy'), scope: PromotionScopeSchema }).strict(),
  spendTodayFilter,
  memberRegistrationFilter,
]);

/** Child action condition — `buy` narrowed to the child-safe scope union. */
const PromotionActionChildFilterSchema = z.discriminatedUnion('action', [
  nothingFilter,
  z.object({ action: z.literal('buy'), scope: PromotionChildScopeSchema }).strict(),
  spendTodayFilter,
  memberRegistrationFilter,
]);

/** Reactions: scope REQUIRED (no unscoped discount exists in podium). */
export const PromotionReactionFilterSchema = z.discriminatedUnion('reaction', [
  z.object({ reaction: z.literal('item'), scope: PromotionScopeSchema }).strict(),
  z
    .object({
      reaction: z.literal('percentage_off'),
      amount: z.number().positive().max(100),
      scope: PromotionScopeSchema,
    })
    .strict(),
  z
    .object({
      reaction: z.literal('off'),
      amount: z.number().positive(),
      scope: PromotionScopeSchema,
    })
    .strict(),
]);

/**
 * Child gate (one nesting level — the page's render cap). Child filters use
 * the narrowed union: podium structurally rejects product/SKU scopes in
 * children (no supplier_id in the child whitelist), so the contract refuses
 * them at authoring time instead of letting the host drop them or podium 422.
 */
const PromotionActionChildGateSchema = z
  .object({
    gate: z.enum(['AND', 'OR']),
    filters: z.array(PromotionActionChildFilterSchema).min(1).max(10),
  })
  .strict();

export const PromotionActionGateSchema = z
  .object({
    gate: z.enum(['AND', 'OR']),
    filters: z.array(PromotionActionFilterSchema).min(1).max(10),
    children: z.array(PromotionActionChildGateSchema).min(1).max(5).optional(),
  })
  .strict();
export type PromotionActionGate = z.infer<typeof PromotionActionGateSchema>;

/** Reaction gate is AND-only and flat in podium — no gate field, no children. */
export const PromotionReactionGateSchema = z
  .object({
    filters: z.array(PromotionReactionFilterSchema).min(1).max(10),
  })
  .strict();
export type PromotionReactionGate = z.infer<typeof PromotionReactionGateSchema>;

export const PromotionPrefillSchema = z
  .object({
    kind: z.literal('promotions_builder'),
    name: z.string().min(1).max(255).optional(),
    /** Per-language titles keyed by language code; model translates. */
    titles: z
      .record(z.string().regex(/^[a-z]{2}-[A-Z]{2}$/), z.string().min(1).max(255))
      .optional(),
    groupLabel: label.optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    maximumTimes: z.number().int().positive().optional(),
    isExclusive: z.boolean().optional(),
    /**
     * Card/account-type display names for the page's required multi-select;
     * host resolves each against the accountType vocabulary (label-first,
     * ids never cross the wire).
     */
    accountTypeLabels: z.array(label).min(1).optional(),
    promoCodes: z.array(z.string().min(1).max(255)).min(1).max(20).optional(),
    actionGate: PromotionActionGateSchema.optional(),
    reactionGate: PromotionReactionGateSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Podium's constraint web, enforced early so the agent fails at authoring:
    if (v.promoCodes && v.maximumTimes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['promoCodes'],
        message: 'codes require maximumTimes (perpetual promos cannot have codes)',
      });
    }
    if (v.isExclusive === true && v.maximumTimes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isExclusive'],
        message: 'exclusive requires maximumTimes (perpetual promos cannot be exclusive)',
      });
    }
    if (v.endDate && v.startDate && v.endDate <= v.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be after startDate',
      });
    }
    // The admin page removes the member_registration action whenever the
    // promotion is limited (non-perpetual): it splices the option out of the
    // dropdown on edit-load and in setLimitedPromo, and a saved combo would
    // crash the edit page's hydration walk. maximumTimes is the limited
    // discriminant — codes and exclusivity already require it above.
    if (v.maximumTimes !== undefined && v.actionGate) {
      const allFilters = [
        ...v.actionGate.filters,
        ...(v.actionGate.children ?? []).flatMap((child) => child.filters),
      ];
      if (allFilters.some((f) => f.action === 'member_registration')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['actionGate'],
          message:
            'member_registration requires a perpetual promotion — limited promotions (maximumTimes/codes/exclusive) cannot use it',
        });
      }
    }
  });
export type PromotionPrefill = z.infer<typeof PromotionPrefillSchema>;

export const ProductCollectionPrefillFilterSchema = z
  .object({
    /** Product-filterable label; host resolves to product_filterables.id. */
    filterLabel: label,
    operator: z.string().min(1).max(64),
    value: z.string().min(1).max(255),
  })
  .strict();

export const ProductCollectionPrefillSchema = z
  .object({
    kind: z.literal('product_collections'),
    name: z.string().min(1).max(255).optional(),
    frequency: z.string().regex(ISO8601_DURATION).optional(),
    /** Product-label display names; host resolves to product_labels ids. */
    productLabels: z.array(label).min(1).max(20).optional(),
    gates: z
      .object({
        gate: z.enum(['AND', 'OR']),
        filters: z.array(ProductCollectionPrefillFilterSchema).min(1).max(20),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ShopConfigurationPrefillSchema = z
  .object({
    kind: z.literal('shop_configuration'),
    name: z.string().min(1).max(255).optional(),
    isActive: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    /** All selections by label; host resolves each against its resolver list. */
    segmentLabel: label.optional(),
    currencyLabel: label.optional(),
    catalogTypeLabel: label.optional(),
    saleChannelLabel: label.optional(),
    pricingCalculatorLabel: label.optional(),
    productCollectionLabels: z.array(label).min(1).max(20).optional(),
  })
  .strict();

export const AdminPrefillSchema = z.discriminatedUnion('kind', [
  SegmentPrefillSchema,
  PromotionPrefillSchema,
  ProductCollectionPrefillSchema,
  ShopConfigurationPrefillSchema,
]);
export type AdminPrefill = z.infer<typeof AdminPrefillSchema>;

/** The targets that accept a prefill payload (kind values of the union). */
export const PREFILLABLE_TARGETS = [
  'customer_segments',
  'promotions_builder',
  'product_collections',
  'shop_configuration',
] as const;

// Inferred types — public API. The admin copilot vendors this module
// (podium_admin_v2 src/lib/contract) and consumes these by name; keep them
// exported even when unused inside the wallet.
export type SegmentPrefillRule = z.infer<typeof SegmentPrefillRuleSchema>;
export type SegmentPrefill = z.infer<typeof SegmentPrefillSchema>;
export type PromotionScope = z.infer<typeof PromotionScopeSchema>;
export type PromotionActionFilter = z.infer<typeof PromotionActionFilterSchema>;
export type PromotionReactionFilter = z.infer<typeof PromotionReactionFilterSchema>;
export type ProductCollectionPrefillFilter = z.infer<typeof ProductCollectionPrefillFilterSchema>;
export type ProductCollectionPrefill = z.infer<typeof ProductCollectionPrefillSchema>;
export type ShopConfigurationPrefill = z.infer<typeof ShopConfigurationPrefillSchema>;
export type PrefillableTarget = (typeof PREFILLABLE_TARGETS)[number];
