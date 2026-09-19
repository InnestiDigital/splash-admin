import { z } from 'zod';

export const CONCIERGE_COHORT_ASSIGNMENTS = ['treatment', 'holdout'] as const;
export type ConciergeCohortAssignment = (typeof CONCIERGE_COHORT_ASSIGNMENTS)[number];

export const CohortVersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/**
 * Signed treatment/holdout provenance carried by a Podium-issued member token.
 *
 * A holdout token is a valid assertion about assignment, but the Rewards
 * Runtime rejects it from the treatment data plane. Podium normally withholds
 * the token entirely for holdout members; keeping the closed value in the
 * wire contract makes both sides fail closed if that boundary regresses.
 */
export const ConciergeCohortSchema = z
  .object({
    assignment: z.enum(CONCIERGE_COHORT_ASSIGNMENTS),
    version: CohortVersionSchema,
  })
  .strict();

export type ConciergeCohort = z.infer<typeof ConciergeCohortSchema>;
