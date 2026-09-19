import { z } from 'zod';

export const REWARDS_LOCALES = ['en-CA', 'en-US', 'fr-CA'] as const;
export const RewardsLocaleSchema = z.enum(REWARDS_LOCALES);
export type RewardsLocale = z.infer<typeof RewardsLocaleSchema>;

export const DEFAULT_REWARDS_LOCALE: RewardsLocale = 'en-CA';
