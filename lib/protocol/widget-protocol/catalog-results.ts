/**
 * Catalog / product-search results slice.
 *
 * Standalone WidgetState-adjacent slice — deliberately NOT wired into
 * `WidgetStateSchema` yet, so the runtime can adopt it additively later.
 *
 * Rationale: today a consumer cannot distinguish a decode failure from a
 * genuine zero-hit search. `disposition` makes that explicit — `results` (hits
 * present), `empty` (searched, nothing matched), `error` (the search failed).
 * The invariant is pinned by a refinement: `results` carries a non-empty
 * `items`; `empty` and `error` carry none.
 *
 * `CatalogProductCardSchema` mirrors the `ProductDetailState` field vocabulary
 * (a compact card projection, not the full detail record).
 */
import { z } from 'zod';
import { StorefrontIdSchema, StorefrontLabelSchema } from './storefront.js';

/** Compact product card — mirrors the `ProductDetailState` field vocabulary. */
export const CatalogProductCardSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    pricePoints: z.number().nonnegative(),
    originalPricePoints: z.number().positive().optional(),
    brand: z.string().optional(),
    imageUrl: z.string().optional(),
    slug: z.string().optional(),
    sku: z.string().optional(),
    productType: z.string().optional(),
    // Optional only for additive decoding of cards persisted before
    // storefront provenance shipped. New runtime results always include it.
    storefrontId: StorefrontIdSchema.optional(),
    storefrontLabel: StorefrontLabelSchema.optional(),
  })
  .strict();
export type CatalogProductCard = z.infer<typeof CatalogProductCardSchema>;

export const CATALOG_DISPOSITIONS = ['results', 'empty', 'error'] as const;

export const CatalogResultsStateSchema = z
  .object({
    disposition: z.enum(CATALOG_DISPOSITIONS),
    /** The already-normalized query that produced this result set. */
    query: z.string().max(300).optional(),
    items: z.array(CatalogProductCardSchema).readonly(),
    /** Server timestamp when the results were observed. */
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.disposition === 'results' && value.items.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: "disposition 'results' requires at least one item",
      });
    }
    if (value.disposition !== 'results' && value.items.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: `disposition '${value.disposition}' must carry no items`,
      });
    }
  });
export type CatalogResultsState = z.infer<typeof CatalogResultsStateSchema>;
