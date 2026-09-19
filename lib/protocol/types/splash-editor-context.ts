/**
 * Advisory editor digest for the Splash assistant (R2E spec §3). Sent per turn
 * on forwardedProps.siteContext.editor while a page is open in the visual
 * editor. Trust: ADVISORY ONLY — it grounds the model's references and flips
 * the write path (digest present ⇒ editor ops, absent ⇒ M3 API tools). All
 * authority still comes from the verified JWT and server-side assertSiteAccess.
 *
 * The host ALWAYS emits a valid object while the editor is mounted, marking a
 * hard-trimmed digest `degraded: true` rather than dropping it — a dropped
 * digest would silently flip the path decision [R14].
 */
import { z } from 'zod';

/** Host-side serialisation budget for one digest (spec §3.3). */
export const MAX_EDITOR_DIGEST_BYTES = 24_000;

const shortLabel = z.string().min(1).max(80);

export const SplashEditorSelectionSchema = z
  .object({
    pageId: z.string().min(1),
    pageLabel: shortLabel,
    pagePath: z.string().max(200).optional(),
    mode: z.enum(['none', 'block', 'section', 'layout', 'theme-settings', 'page-settings']),
    sectionId: z.string().optional(),
    sectionLabel: shortLabel.optional(),
    blockId: z.string().optional(),
    blockType: z.string().max(80).optional(),
    /** mode === 'layout' — which layout is being edited [R14]. */
    layoutType: z.enum(['header', 'footer']).optional(),
    /** Section context that outlives a block selection; by:'selection' falls back to it [R14]. */
    activeSectionId: z.string().optional(),
  })
  .strict();
export type SplashEditorSelection = z.infer<typeof SplashEditorSelectionSchema>;

export const SplashEditorOutlineBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().max(80),
    label: shortLabel,
    layoutRole: z.string().max(60).optional(),
  })
  .strict();
export type SplashEditorOutlineBlock = z.infer<typeof SplashEditorOutlineBlockSchema>;

export const SplashEditorOutlineSectionSchema = z
  .object({
    id: z.string().min(1),
    label: shortLabel,
    sectionType: z.string().max(60).optional(),
    colorScheme: z.string().max(40).optional(),
    containerMode: z.string().max(40).optional(),
    hidden: z.boolean().optional(),
    blocks: z.array(SplashEditorOutlineBlockSchema).max(40),
    blocksOmitted: z.number().int().nonnegative().optional(),
  })
  .strict();
export type SplashEditorOutlineSection = z.infer<typeof SplashEditorOutlineSectionSchema>;

export const SplashEditorVocabularySchema = z
  .object({
    theme: z.string().max(80),
    sectionTypes: z
      .array(
        z.object({
          type: z.string().max(60),
          label: shortLabel,
          slots: z
            .array(
              z.object({
                role: z.string().max(60),
                required: z.boolean(),
                multiple: z.boolean(),
              }).strict(),
            )
            .max(12),
        }).strict(),
      )
      .max(12),
    blockTypes: z
      .array(
        z.object({
          type: z.string().max(80),
          label: shortLabel,
          compatibleSectionRoles: z.array(z.string().max(60)).max(12).optional(),
          // Declared setting ids so the model writes settings keys that exist
          // without a list_block_schemas round-trip. Ids only — option
          // vocabularies stay runtime-side to hold the 24 KB digest budget.
          settings: z.array(z.string().max(60)).max(16).optional(),
        }).strict(),
      )
      .max(160),
    layoutRoles: z.array(z.string().max(60)).max(20),
    // Section presentation vocabulary so "make this section dark" is grounded [R9].
    colorSchemes: z.array(z.string().max(40)).max(12),
    containerModes: z.array(z.string().max(40)).max(12),
    presentationFields: z.array(z.string().max(40)).max(20),
    typographyPresets: z.array(shortLabel).max(60),
    typographyRoles: z.array(z.string().max(60)).max(20),
  })
  .strict();
export type SplashEditorVocabulary = z.infer<typeof SplashEditorVocabularySchema>;

/** Media library ceiling for one digest. The tail is reported as `omitted`. */
export const MAX_EDITOR_MEDIA_ITEMS = 100;

/**
 * One row of the site's media library, as the model reads it.
 *
 * Deliberately id + filename + kind and nothing else: `attach_media` resolves
 * the id against the library itself, so the digest's only job is to let the
 * model NAME an asset it can see the operator already uploaded. URLs, sizes and
 * timestamps would multiply the per-turn cost of the largest list in the digest
 * without changing which id it picks.
 */
export const SplashEditorMediaItemSchema = z
  .object({
    id: z.string().min(1).max(64),
    filename: shortLabel,
    kind: z.enum(['image', 'video', 'other']),
  })
  .strict();
export type SplashEditorMediaItem = z.infer<typeof SplashEditorMediaItemSchema>;

export const SplashEditorMediaSchema = z
  .object({
    items: z.array(SplashEditorMediaItemSchema).max(MAX_EDITOR_MEDIA_ITEMS),
    /** Rows the library holds beyond `items`. Present only when it truncated. */
    omitted: z.number().int().nonnegative().optional(),
  })
  .strict();
export type SplashEditorMedia = z.infer<typeof SplashEditorMediaSchema>;

/** Outcome of the previous op batch, fed back to the model on the next turn (spec §5.5). */
export const SplashEditorOpsReportSchema = z
  .object({
    batchId: z.string().min(1),
    applied: z.array(z.string().max(200)).max(20),
    failed: z
      .array(z.object({ opId: z.string().max(80), reason: z.string().max(200) }).strict())
      .max(20),
    warnings: z.array(z.string().max(200)).max(10).optional(),
  })
  .strict();
export type SplashEditorOpsReport = z.infer<typeof SplashEditorOpsReportSchema>;

export const SplashEditorContextSchema = z
  .object({
    selection: SplashEditorSelectionSchema,
    outline: z.array(SplashEditorOutlineSectionSchema).max(60),
    outlineOmitted: z.number().int().nonnegative().optional(),
    unsectioned: z.array(SplashEditorOutlineBlockSchema).max(40).optional(),
    vocabulary: SplashEditorVocabularySchema,
    /**
     * The site's media library. Absent means "not loaded", never "empty" — the
     * model must not conclude the operator has no assets from a missing key.
     */
    media: SplashEditorMediaSchema.optional(),
    /** Terminal clamp fired: the outline is incomplete, the model must ask [R14]. */
    degraded: z.boolean().optional(),
    lastOpsReport: SplashEditorOpsReportSchema.optional(),
  })
  .strict();
export type SplashEditorContext = z.infer<typeof SplashEditorContextSchema>;
