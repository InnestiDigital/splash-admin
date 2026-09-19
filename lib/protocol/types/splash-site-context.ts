import { z } from 'zod';
import { SplashEditorContextSchema } from './splash-editor-context.js';

/**
 * Advisory per-turn admin context for the Splash assistant (spec §3.3,
 * gap-invoke-context §3): the admin host's active program + site, sent on
 * every run via forwardedProps. Trust: advisory only — the runtime cross-checks
 * programId against the JWT claim and every Splash API call re-authorizes
 * server-side via assertSiteAccess.
 *
 * R2E: `editor` is the optional advisory editor digest. This object is
 * .strict(), so an admin sending `editor` to a runtime whose schema lacks the
 * key loses the WHOLE context and every site-scoped tool reports "no site
 * selected". Deploy the runtime BEFORE the admin starts sending it, and never
 * roll the runtime back behind this commit while such an admin is live [R15].
 */
export const SplashSiteContextSchema = z
  .object({
    programId: z.string().min(1),
    siteId: z.string().min(1),
    editor: SplashEditorContextSchema.optional(),
  })
  .strict();
export type SplashSiteContext = z.infer<typeof SplashSiteContextSchema>;
