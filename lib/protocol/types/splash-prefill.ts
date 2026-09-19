/**
 * Splash admin form prefill — the /pendingPrefill slice for the Splash
 * assistant (SplashRuntime). Label-first doctrine: the model sends human
 * labels taken VERBATIM from read-tool responses, never ids/paths/URLs.
 * Every field optional (partial prefill is native). kind === nav target ===
 * admin route name; a Splash-side drift test guards all three.
 * NO password fields (ruling 7), NO media/logo fields (ruling 8), NO slug
 * on page create (the admin UI derives it client-side).
 */
import { z } from 'zod';

export const SPLASH_PREFILL_KINDS = [
  'admin-context-articles-new', 'admin-context-blogs-new',
  'admin-context-pages', 'admin-users', 'admin-context-brand-identity',
] as const; // kind === nav target === admin route name
export type SplashPrefillKind = (typeof SPLASH_PREFILL_KINDS)[number];

const label = z.string().min(1).max(160);

export const SplashPrefillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admin-context-articles-new'),
    title: z.string().min(1).max(200).optional(),
    blogLabel: label.optional(), templateLabel: label.optional() }).strict(),
  z.object({ kind: z.literal('admin-context-blogs-new'),
    title: z.string().min(1).max(200).optional(),
    templateLabel: label.optional() }).strict(),
  z.object({ kind: z.literal('admin-context-pages'),
    title: z.string().min(1).max(200).optional(),
    pageType: z.enum(['static', 'blog-index', 'article']).optional(),
    parentLabel: label.optional(), templateLabel: label.optional() }).strict(),
  z.object({ kind: z.literal('admin-users'),
    email: z.string().email().optional(),
    firstName: z.string().max(120).optional(), lastName: z.string().max(120).optional(),
    role: z.enum(['admin', 'editor', 'viewer', 'client']).optional(),
    programLabel: label.optional(), siteLabels: z.array(label).max(20).optional(),
    brandPresetLabel: label.optional() }).strict(), // NO password field — ruling 7
  z.object({ kind: z.literal('admin-context-brand-identity'),
    brandName: z.string().max(160).optional(), tagline: z.string().max(300).optional(),
    toneWords: z.string().max(300).optional(),
    doRules: z.string().max(2000).optional(), dontRules: z.string().max(2000).optional(),
    brandPrimaryLabel: label.optional(), brandSecondaryLabel: label.optional(),
    brandSurfaceLabel: label.optional(), brandOnSurfaceLabel: label.optional(),
    headlineRoleLabel: label.optional(), bodyRoleLabel: label.optional() }).strict(),
    // no logo fields — media excluded, ruling 8
]);
export type SplashPrefill = z.infer<typeof SplashPrefillSchema>;

export const SplashPendingPrefillSchema = z.object({
  prefillId: z.string().min(1), prefill: SplashPrefillSchema,
}).strict();
export type SplashPendingPrefill = z.infer<typeof SplashPendingPrefillSchema>;
