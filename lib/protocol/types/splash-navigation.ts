/**
 * Splash admin navigation — closed target catalog + the /pendingNavigation
 * slice for the Splash assistant (SplashRuntime).
 *
 * The model NEVER emits a path or URL. It picks ONE `target` from this closed
 * enum; the host (splash-cms admin) owns the target→route map. Values are
 * Splash admin route NAMES from `admin/config/routes.ts` — non-auth,
 * non-parameterized routes only (R0). A drift test on the Splash side asserts
 * every value maps to a registered route.
 *
 * Deliberately a SECOND navigation module beside admin-navigation.ts (rewards):
 * different host, different catalog, no prefill/edit/plan slots in R0.
 */
import { z } from 'zod';

/** Closed catalog of Splash admin destinations (route names, page-level only). */
export const SPLASH_NAV_TARGETS = [
  'admin',
  'admin-programs',
  'admin-sites',
  'admin-users',
  'admin-context',
  'admin-context-site',
  'admin-context-editor',
  'admin-context-publish',
  'admin-context-media',
  'admin-context-typography',
  'admin-context-brand-identity',
  'admin-context-brand-assets',
  'admin-context-brand-canvases',
  'admin-context-pages',
  'admin-context-articles',
  'admin-context-articles-new',
  'admin-context-blogs',
  'admin-context-blogs-new',
  'admin-context-layouts',
  'admin-context-settings-data',
  'admin-context-settings-activity',
  'admin-context-settings-variables',
  'admin-context-settings-domains',
  'admin-context-settings-recovery',
] as const;
export type SplashNavTarget = (typeof SPLASH_NAV_TARGETS)[number];
export const SplashNavTargetSchema = z.enum(SPLASH_NAV_TARGETS);

/**
 * `/pendingNavigation` WidgetState slice — a ONE-SHOT navigation directive.
 * `navId` is deterministic per tool use (see SplashRuntime navigation tool) so
 * a STATE_SNAPSHOT replay never re-fires the navigation: the host acts once
 * per new navId.
 */
export const SplashPendingNavigationSchema = z
  .object({
    target: SplashNavTargetSchema,
    /** Stable per-directive id; the host acts once per new navId. */
    navId: z.string().min(1),
    /** Display-only caption. The host MUST NOT derive navigation from it. */
    label: z.string().min(1).max(120).optional(),
  })
  .strict();
export type SplashPendingNavigationState = z.infer<typeof SplashPendingNavigationSchema>;
