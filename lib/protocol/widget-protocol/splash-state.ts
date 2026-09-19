/**
 * Canonical Splash-assistant WidgetState. Deliberately a SECOND widget-state
 * module beside widget-state.ts (rewards) — do not extend the rewards shape.
 * The Splash admin host folds STATE_SNAPSHOT/STATE_DELTA into this shape.
 */
import { z } from 'zod';
import { SplashPendingNavigationSchema } from '../types/splash-navigation.js';
import { SplashPendingPrefillSchema } from '../types/splash-prefill.js';
import { SplashPendingEditorOpsSchema } from '../types/splash-editor-ops.js';

export const SplashWidgetStateSchema = z
  .object({
    pendingNavigation: SplashPendingNavigationSchema.nullable(),
    pendingPrefill: SplashPendingPrefillSchema.nullable(),
    /** R2E: one editor op batch, applied then acked+cleared by the host [R8]. */
    pendingEditorOps: SplashPendingEditorOpsSchema.nullable(),
  })
  .strict();
export type SplashWidgetState = z.infer<typeof SplashWidgetStateSchema>;

export const EMPTY_SPLASH_WIDGET_STATE: SplashWidgetState = {
  pendingNavigation: null,
  pendingPrefill: null,
  pendingEditorOps: null,
} as const;
