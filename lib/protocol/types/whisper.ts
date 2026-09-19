/**
 * Concierge whisper — agent-initiated suggestion surfaced on the
 * host page (above launcher) and inside the widget (as pills).
 * Server-emitted via the AG-UI `whispers[]` slice.
 */
import { z } from 'zod';

export const WhisperKindSchema = z.enum([
  'brand_affinity',
  'category_affinity',
  'promo_group_affinity',
  'deal_expiring_soon',
]);
export type WhisperKind = z.infer<typeof WhisperKindSchema>;

/**
 * Sidecar metadata attached to a whisper by an enricher between
 * source emission and ranking. Discriminated union — open/closed:
 * adding a new decoration kind = new variant + new widget renderer
 * registry entry. Existing widgets ignore unknown kinds.
 */
export const WhisperDecorationSchema = z
  .object({
    kind: z.literal('promo'),
    groupCode: z.string().min(1).max(160),
    groupName: z.string().min(1).max(160),
    endDateUtc: z.string().datetime({ offset: true }).optional(),
    urgencyHours: z.number().int().nonnegative().optional(),
  })
  .strict();
export type WhisperDecoration = z.infer<typeof WhisperDecorationSchema>;

export const WhisperSchema = z
  .object({
    /** Stable id derived from `(kind, subject)`, e.g. `"wsp:brand:Bose"`. */
    id: z.string().min(1).max(255),
    kind: WhisperKindSchema,
    /** Headline rendered in host-page bubble, e.g. "Want to see Bose products?". */
    title: z.string().min(1).max(255),
    /** "because…" chip text shown only on the host-page bubble. */
    because: z.string().min(1).max(255),
    /** Concierge query that fires when user activates the whisper. */
    seedQuery: z.string().min(1).max(500),
    /** Canonical subject (brand or category name) for compact in-chat pills. */
    subject: z.string().min(1).max(255),
    /** ISO-8601 timestamp at production time. */
    createdAt: z.string().datetime({ offset: true }),
    /** Optional decorations emitted only when an enricher supplies them. */
    decorations: z.array(WhisperDecorationSchema).max(10).readonly().optional(),
  })
  .strict();
export type Whisper = z.infer<typeof WhisperSchema>;
