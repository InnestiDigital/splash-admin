/**
 * Splash editor operations — the /pendingEditorOps slice (R2E spec §4).
 *
 * The model emits an ORDERED batch of ops; the splash-cms host executor maps
 * each one to the SAME store action a human click would call, so live preview,
 * autosave sequencing and undo all come for free. Ops carry NO authority: they
 * execute inside the operator's authenticated admin session against the same
 * endpoints, middleware and RBAC a click hits.
 *
 * Reference discipline: the model may never invent an id. Every target is a
 * SplashEditorRef the host resolves against LIVE store state (id membership,
 * unique normalised label, an earlier op's `ref`, or the current selection).
 *
 * Deliberately a SECOND ops module beside the rewards shapes — do not extend
 * those. Authored here, re-vendored verbatim into splash-cms `admin/lib/`.
 */
import { z } from 'zod';

/**
 * The section types the reference theme ships — a SEED for prompting and
 * documentation, no longer the protocol's ceiling.
 *
 * Section types are theme vocabulary (SPL/L3): a theme declares them as
 * `section-types/<type>.settings.json`, so an enum here would make the protocol
 * unable to name a type the renderer can render. The op schemas therefore carry
 * a bounded string, and the EXECUTOR narrows it to the open theme's own
 * vocabulary (`facade.knownSectionTypes()`), which is a runtime check against
 * live theme data rather than a compile-time list.
 */
export const SPLASH_EDITOR_SECTION_TYPES = ['hero', 'stacked', 'editorial-split', 'gallery'] as const;
export type SplashEditorSectionType = string;

/** Section type ids are schema-file basenames; bound the string so it can never be a payload. */
export const SplashEditorSectionTypeSchema = z.string().min(1).max(60);

export const SPLASH_EDITOR_LAYOUT_TYPES = ['header', 'footer'] as const;

/** Presentation-only allowlist for update_section — sectionType and position are deliberately absent [R9]. */
export const SPLASH_SECTION_PRESENTATION_FIELDS = [
  'name', 'anchor', 'colorScheme', 'containerMode', 'containerInsetX',
  'sectionSpaceY', 'isHidden', 'revealPreset', 'defaultBlockEntrance',
] as const;
export type SplashSectionPresentationField = (typeof SPLASH_SECTION_PRESENTATION_FIELDS)[number];

export const MAX_EDITOR_OPS_PER_BATCH = 20;
const MAX_SETTINGS_KEYS = 40;

export const SPLASH_EDITOR_OP_KINDS = [
  'add_section', 'update_section', 'change_section_type', 'delete_section',
  'reorder_sections', 'duplicate_section', 'update_layout_config',
  'add_block', 'update_block_settings', 'set_block_field', 'delete_block',
  'reorder_blocks', 'move_block', 'attach_media', 'set_block_placement',
  'update_page_settings', 'update_theme_settings', 'update_layout_settings',
  'update_typography_preset', 'set_typography_roles',
  'select',
] as const;
export type SplashEditorOpKind = (typeof SPLASH_EDITOR_OP_KINDS)[number];

export const SplashEditorRefSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('id'), id: z.string().min(1).max(64) }).strict(),
  z.object({ by: z.literal('label'), label: z.string().min(1).max(80) }).strict(),
  z.object({ by: z.literal('ref'), ref: z.string().min(1).max(24) }).strict(),
  z.object({ by: z.literal('selection') }).strict(),
]);
export type SplashEditorRef = z.infer<typeof SplashEditorRefSchema>;

const refKey = (ref: SplashEditorRef): string => {
  switch (ref.by) {
    case 'id': return `id:${ref.id}`;
    case 'label': return `label:${ref.label}`;
    case 'ref': return `ref:${ref.ref}`;
    case 'selection': return 'selection';
    default: {
      const exhaustive: never = ref;
      throw new Error(`unhandled ref kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};

/**
 * The host enforces the FULL-PERMUTATION precondition against live store state
 * (a partial order is permanent block loss through blocks/replace-all) [R4].
 * The protocol contributes the half that needs no state: at least two entries,
 * pairwise distinct — which also rejects a degenerate repeated `selection`.
 */
const orderList = (max: number) =>
  z.array(SplashEditorRefSchema).min(2).max(max).refine(
    (order) => new Set(order.map(refKey)).size === order.length,
    { message: 'order must list each target exactly once (send the complete new order)' },
  );

const settings = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= MAX_SETTINGS_KEYS, {
    message: `at most ${MAX_SETTINGS_KEYS} settings keys per op`,
  });

/**
 * NOT z.record(z.enum(FIELDS), …): a zod-4 enum-keyed record materialises EVERY
 * enum key in its output, so an empty patch would arrive at the executor as
 * nine undefined presentation fields. String key + allowlist refine keeps the
 * closed vocabulary AND the exact keys the model sent.
 */
const sectionPresentationPatch = z
  .record(z.string(), z.unknown())
  .refine((value) => {
    const keys = Object.keys(value);
    return (
      keys.length >= 1 &&
      keys.length <= SPLASH_SECTION_PRESENTATION_FIELDS.length &&
      keys.every((key) => (SPLASH_SECTION_PRESENTATION_FIELDS as readonly string[]).includes(key))
    );
  }, {
    message: `patch must be a non-empty subset of: ${SPLASH_SECTION_PRESENTATION_FIELDS.join(', ')}`,
  });

/** Optional handle a later op in the same batch can point at via { by: 'ref' }. */
const opBase = { ref: z.string().min(1).max(24).optional() };

export const SplashEditorOpSchema = z.discriminatedUnion('kind', [
  // ── Sections ──
  z.object({ ...opBase, kind: z.literal('add_section'),
    name: z.string().min(1).max(120),
    sectionType: SplashEditorSectionTypeSchema.optional(),
    position: z.number().int().min(0).max(200).optional(),
    colorScheme: z.enum(['light', 'dark', 'accent', 'custom', 'transparent']).optional(),
    containerMode: z.enum(['measure', 'content', 'wide', 'full-bleed']).optional(),
    blocks: z.array(z.object({
      type: z.string().min(1).max(80),
      layoutRole: z.string().max(60).optional(),
      settings: settings.optional(),
    }).strict()).max(12).optional() }).strict(),

  z.object({ ...opBase, kind: z.literal('update_section'),
    target: SplashEditorRefSchema, patch: sectionPresentationPatch }).strict(),

  z.object({ ...opBase, kind: z.literal('change_section_type'),
    target: SplashEditorRefSchema, sectionType: SplashEditorSectionTypeSchema }).strict(),

  // Two-phase [R7]: phase 1 omits confirm; the HOST applies nothing and returns
  // the loss inventory. The runtime passes a confirm-less op through untouched.
  z.object({ ...opBase, kind: z.literal('delete_section'),
    target: SplashEditorRefSchema, confirm: z.literal(true).optional() }).strict(),

  z.object({ ...opBase, kind: z.literal('reorder_sections'), order: orderList(60) }).strict(),

  z.object({ ...opBase, kind: z.literal('duplicate_section'),
    target: SplashEditorRefSchema }).strict(),

  /**
   * Set a section's LAYOUT settings — the `layoutConfig` keys its section type
   * declares (`spreadBalance`, `shellSide`, `contentWidthRatio`, …).
   *
   * Separate from `update_section`, whose allowlist is presentation columns and
   * deliberately excludes this: `layoutConfig` is a JSON column whose legal keys
   * and legal values are THEME data, different per section type, and the
   * host validates both against the section type's own schema before writing.
   * Values are strings because every bound layout setting is a select/radio/
   * toggle whose options the schema enumerates; a free-form value has no
   * declared option to match and is refused.
   */
  z.object({ ...opBase, kind: z.literal('update_layout_config'),
    target: SplashEditorRefSchema,
    values: z.record(z.string().min(1).max(60), z.string().min(1).max(120))
      .refine((value) => {
        const count = Object.keys(value).length
        return count >= 1 && count <= 20
      }, { message: 'send between 1 and 20 layoutConfig values' }) }).strict(),

  // ── Blocks ──
  z.object({ ...opBase, kind: z.literal('add_block'),
    blockType: z.string().min(1).max(80),
    section: SplashEditorRefSchema.optional(),
    indexInSection: z.number().int().min(0).max(200).optional(),
    layoutRole: z.string().max(60).optional(),
    settings: settings.optional() }).strict(),

  z.object({ ...opBase, kind: z.literal('update_block_settings'),
    target: SplashEditorRefSchema, patch: settings }).strict(),

  // Separate member: different store action, different local-apply semantics [R3].
  z.object({ ...opBase, kind: z.literal('set_block_field'),
    target: SplashEditorRefSchema,
    fieldPath: z.string().min(1).max(200),
    value: z.unknown() })
    .strict()
    // z.unknown() is implicitly optional in zod: presence must be asserted (ruling E).
    .refine((op) => 'value' in op, { message: 'value is required (use null to clear)' }),

  z.object({ ...opBase, kind: z.literal('delete_block'),
    target: SplashEditorRefSchema }).strict(),

  z.object({ ...opBase, kind: z.literal('reorder_blocks'),
    section: SplashEditorRefSchema, order: orderList(40) }).strict(),

  z.object({ ...opBase, kind: z.literal('move_block'),
    target: SplashEditorRefSchema,
    toSection: SplashEditorRefSchema,
    indexInSection: z.number().int().min(0).max(200).optional(),
    layoutRole: z.string().max(60).optional() }).strict(),

  /**
   * Point a block's media field at a row of THIS site's media library.
   *
   * `set_block_field` can write the same key, but it carries `z.unknown()` and
   * resolves nothing: the model has to guess the stored SHAPE (a URL for block
   * authoring, an id for article content) and nothing checks the value names a
   * real asset. Both mistakes land as a broken image the author finds later.
   * Here the host resolves the id in the library, reads the field's declared
   * `valueMode`, and writes the shape that field actually stores.
   *
   * `mode` overrides that derived shape and is the escape hatch for a field
   * whose schema does not declare one; leaving it off is the normal case.
   */
  z.object({ ...opBase, kind: z.literal('attach_media'),
    target: SplashEditorRefSchema,
    fieldPath: z.string().min(1).max(200),
    // `media.id` is a varchar(36). The pattern mirrors the server's own
    // `MEDIA_ID_RE` so a junk string is refused at the wire rather than spent
    // on a library round trip.
    mediaId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/, {
      message: 'mediaId must be a media library id',
    }),
    mode: z.enum(['id', 'url']).optional() }).strict(),

  /**
   * Free-position a block inside a LAYERED slot: `placement.canvas` geometry,
   * in percentages of the owning section.
   *
   * Legal only where the enclosing section type declares a layered slot — the
   * host resolves that against the open theme's own schemas and refuses
   * otherwise, because geometry written into a flow section is stored, invisible
   * and impossible to find later. The bounds below are a payload guard only; the
   * authoritative bounds are the renderer's own geometry contract, which the
   * host checks before it writes.
   */
  z.object({ ...opBase, kind: z.literal('set_block_placement'),
    target: SplashEditorRefSchema,
    canvas: z.object({
      x: z.number().min(-1000).max(1000).optional(),
      y: z.number().min(-1000).max(1000).optional(),
      width: z.number().min(-1000).max(1000).optional(),
      height: z.number().min(-1000).max(1000).optional(),
      rotation: z.number().min(-360).max(360).optional(),
      zIndex: z.number().int().min(-1000).max(1000).optional(),
      locked: z.boolean().optional(),
    }).strict().refine(value => Object.keys(value).length > 0, {
      message: 'canvas must carry at least one geometry field',
    }) }).strict(),

  // ── Page / theme / typography ──
  z.object({ ...opBase, kind: z.literal('update_page_settings'), patch: settings }).strict(),
  z.object({ ...opBase, kind: z.literal('update_theme_settings'), patch: settings }).strict(),
  z.object({ ...opBase, kind: z.literal('update_layout_settings'),
    layoutType: z.enum(SPLASH_EDITOR_LAYOUT_TYPES), patch: settings }).strict(),
  z.object({ ...opBase, kind: z.literal('update_typography_preset'),
    presetLabel: z.string().min(1).max(120), patch: settings }).strict(),
  // Partial role → preset LABEL map (null clears); the host MERGES it over the
  // current roles and PUTs the complete map — the server replaces all [R5].
  z.object({ ...opBase, kind: z.literal('set_typography_roles'),
    roles: z.record(z.string().min(1).max(60), z.string().min(1).max(120).nullable())
      .refine((value) => {
        const count = Object.keys(value).length;
        return count >= 1 && count <= 20;
      }, { message: 'send between 1 and 20 role mappings' }) }).strict(),

  // ── Selection (no write) ──
  z.object({ ...opBase, kind: z.literal('select'), target: SplashEditorRefSchema }).strict(),
]);
export type SplashEditorOp = z.infer<typeof SplashEditorOpSchema>;

export const SplashPendingEditorOpsSchema = z
  .object({
    batchId: z.string().min(1).max(100),
    /** Must equal the open page; a mismatch drops the whole batch host-side (spec §5.5). */
    pageId: z.string().min(1),
    summary: z.string().min(1).max(200),
    ops: z.array(SplashEditorOpSchema).min(1).max(MAX_EDITOR_OPS_PER_BATCH),
  })
  .strict();
export type SplashPendingEditorOps = z.infer<typeof SplashPendingEditorOpsSchema>;
