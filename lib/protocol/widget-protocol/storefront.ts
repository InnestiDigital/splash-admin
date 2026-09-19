import { z } from 'zod';

/**
 * Stable storefront identifier. Podium supplies its program-vendor code
 * (for example `APPLE`); clients must treat it as an opaque identifier.
 */
export const StorefrontIdSchema = z.string().trim().min(1).max(64);
export type StorefrontId = z.infer<typeof StorefrontIdSchema>;
export const StorefrontLabelSchema = z.string().trim().min(1).max(240);

/** Client-safe storefront vocabulary resolved under the authenticated member. */
export const StorefrontRefSchema = z
  .object({
    storefrontId: StorefrontIdSchema,
    label: StorefrontLabelSchema,
    isDefault: z.boolean(),
  })
  .strict();
export type StorefrontRef = z.infer<typeof StorefrontRefSchema>;
