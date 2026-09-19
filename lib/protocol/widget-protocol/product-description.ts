/**
 * Bounded plain-text product description schema.
 *
 * ADDITIVE variant of the (module-private) `PlainProductDescriptionSchema` in
 * `widget-state.ts`: same plain-text / decoded-entity guards, PLUS a 2000-char
 * bound. It exists as a separate export so producers can adopt the length bound
 * without tightening the existing `ProductDetailState.description` field, whose
 * current producers are not yet length-bounded (tightening it in place would be
 * a breaking change to what current clients parse).
 */
import { z } from 'zod';

export const BoundedProductDescriptionSchema = z
  .string()
  .max(2000)
  .refine((value) => !/<\/?[a-z][^>]*>/iu.test(value), {
    message: 'product descriptions must be plain text, not HTML',
  })
  .refine((value) => !/(?:&amp;|&#\d+;|&#x[\da-f]+;|&[a-z][\da-z]+;)/iu.test(value), {
    message: 'product descriptions must contain decoded text, not HTML entities',
  });
export type BoundedProductDescription = z.infer<typeof BoundedProductDescriptionSchema>;
