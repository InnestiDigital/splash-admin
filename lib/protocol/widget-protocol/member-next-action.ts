import { z } from 'zod';

/**
 * Deterministic member continuations composed from verified WidgetState.
 *
 * The runtime chooses the action; each host owns its localized label and
 * native destination. This is intentionally a small closed set rather than a
 * generic command bus or model-authored prompt surface.
 */
export const MemberNextActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('review_cart') }).strict(),
  z
    .object({
      kind: z.literal('track_order'),
      orderId: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({
      kind: z.literal('find_affordable'),
      maxPoints: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ kind: z.literal('explain_earnings') }).strict(),
]);
export type MemberNextAction = z.infer<typeof MemberNextActionSchema>;

export const MemberNextActionsSchema = z.array(MemberNextActionSchema).max(3).readonly();
export type MemberNextActions = z.infer<typeof MemberNextActionsSchema>;
