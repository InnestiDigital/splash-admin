/**
 * Canonical knowledge-base answer shape.
 *
 * Mirrors the runtime's `RewardsKnowledgeResult`
 * (app/RewardsRuntime/src/knowledge.ts) as a wire contract. The runtime
 * expresses the outcome as two booleans (`answerable` / `unavailable`); this
 * collapses them into a single `status` discriminant:
 * - `grounded`     ⇐ answerable                     (chunks/citations present)
 * - `no_match`     ⇐ !answerable && !unavailable    (searched, found nothing)
 * - `unavailable`  ⇐ unavailable                    (the KB could not be checked)
 *
 * `citations` are the surfaced sources (https only). `chunks` mirror
 * `RewardsKnowledgeChunk` field-for-field and are optional — a grounded answer
 * MAY omit them (a consumer that only needs sources should not have to carry the
 * retrieved text).
 */
import { z } from 'zod';

/** https-only URL — KB sources are never plain-http or non-URL strings. */
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), {
    message: 'must be an https URL',
  });

/** A surfaced knowledge source. */
export const KnowledgeCitationSchema = z
  .object({
    url: HttpsUrlSchema,
    title: z.string().optional(),
  })
  .strict();
export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>;

/**
 * A retrieved passage — mirrors `RewardsKnowledgeChunk`. `text` is bounded to
 * 2000 chars, matching the runtime's per-chunk slice.
 */
export const KnowledgeChunkSchema = z
  .object({
    text: z.string().max(2000),
    title: z.string(),
    url: HttpsUrlSchema.optional(),
  })
  .strict();
export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

export const KNOWLEDGE_RESULT_STATUSES = ['grounded', 'no_match', 'unavailable'] as const;

export const KnowledgeResultSchema = z
  .object({
    status: z.enum(KNOWLEDGE_RESULT_STATUSES),
    citations: z.array(KnowledgeCitationSchema).readonly(),
    chunks: z.array(KnowledgeChunkSchema).readonly().optional(),
  })
  .strict();
export type KnowledgeResult = z.infer<typeof KnowledgeResultSchema>;
