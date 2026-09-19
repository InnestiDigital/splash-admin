import { z } from 'zod';

/**
 * ADVISORY context about the page the user currently has open, published by
 * the HOST from data its own resolvers already loaded (Sidekick-style
 * "the page you're on is context"). AUTHORING AID ONLY — labels, never ids;
 * no authority; the host re-validates everything a prefill references
 * before patching. GENERAL-SCOPE surface: prefill grounding is the first
 * consumer; admin insight cards and member-surface variants extend this union
 * with new `page` values — extend HERE, never with a second context channel.
 */
const MAX_ITEMS = 100;
const label = z.string().min(1).max(160);

export const PageFilterVocabularyItemSchema = z
  .object({
    label,
    operators: z.array(z.string().min(1).max(64)).max(30),
  })
  .strict();
export type PageFilterVocabularyItem = z.infer<typeof PageFilterVocabularyItemSchema>;

export const SegmentBuilderPageContextSchema = z
  .object({
    page: z.literal('segment_builder'),
    /** From the page's GET /v1/admin/group/filter resolver data. */
    segmentFilters: z.array(PageFilterVocabularyItemSchema).max(MAX_ITEMS),
  })
  .strict();

// Complete lists (cap 1000), and NO attribute vocabulary — attribute scopes
// resolve host-side from the admin's words.
const FULL_LIST = 1000;

export const PromotionBuilderPageContextSchema = z
  .object({
    page: z.literal('promotion_builder'),
    /** Program languages for per-language titles; exactly one isDefault. */
    languages: z
      .array(z.object({ code: z.string().min(2).max(10), isDefault: z.boolean() }).strict())
      .max(10)
      .optional(),
    rewardTypes: z.array(label).max(20).optional(),
    actions: z.array(label).max(20).optional(),
    reactions: z.array(label).max(20).optional(),
    groups: z.array(label).max(FULL_LIST).optional(),
    accountTypes: z.array(label).max(FULL_LIST).optional(),
    productLabels: z.array(label).max(FULL_LIST).optional(),
    collections: z.array(label).max(FULL_LIST).optional(),
    /** Complete brand list (671 on RBC) — the model sees it all. */
    brands: z.array(label).max(FULL_LIST).optional(),
    /**
     * Best-effort: first 500 via the resolver's `count` request param.
     * podium's SupplierController ignores `with_paginator` (it never calls
     * IndexBuilder::withPaginator and its index request whitelists only
     * program_id/code) — a truly complete list needs a podium.api change.
     */
    suppliers: z.array(label).max(FULL_LIST).optional(),
  })
  .strict();

export const ProductCollectionBuilderPageContextSchema = z
  .object({
    page: z.literal('product_collection_builder'),
    productFilterables: z.array(PageFilterVocabularyItemSchema).max(MAX_ITEMS).optional(),
    productLabels: z.array(label).max(MAX_ITEMS).optional(),
  })
  .strict();

export const ShopBuilderPageContextSchema = z
  .object({
    page: z.literal('shop_builder'),
    segments: z.array(label).max(MAX_ITEMS).optional(),
    currencies: z.array(label).max(MAX_ITEMS).optional(),
    catalogTypes: z.array(label).max(MAX_ITEMS).optional(),
    saleChannels: z.array(label).max(MAX_ITEMS).optional(),
    pricingCalculators: z.array(label).max(MAX_ITEMS).optional(),
    productCollections: z.array(label).max(MAX_ITEMS).optional(),
  })
  .strict();

export const PageContextSchema = z.discriminatedUnion('page', [
  SegmentBuilderPageContextSchema,
  PromotionBuilderPageContextSchema,
  ProductCollectionBuilderPageContextSchema,
  ShopBuilderPageContextSchema,
]);
export type PageContext = z.infer<typeof PageContextSchema>;
