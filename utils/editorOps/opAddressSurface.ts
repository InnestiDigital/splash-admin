// admin/utils/editorOps/opAddressSurface.ts
//
// What each op kind may WRITE, in editable-surface addresses (Editing Surface
// v2, D8).
//
// The rule this declaration exists to enforce: an op's target and payload
// surface must be a subset of the registry-declared writable addresses for its
// address class. `tests/admin/utils/editorOps/opAddressSurface.test.ts` walks
// this map against the reference theme's registry and fails the build when the
// two disagree — an op that reaches an address the registry does not flag
// `agent-writable`, a claim whose address no longer exists, or a kind added to
// the union with no declaration here.
//
// Declaring the surface is the cheap cost D8 describes: adding an op means one
// entry here, not a new validation module. It is deliberately EXPLICIT rather
// than derived from the executor's source — a derivation would agree with the
// executor by construction, which is precisely the agreement nobody needs
// checked.
//
// Nothing at runtime reads this map. It is a declaration the test enforces.
import { SPLASH_SECTION_PRESENTATION_FIELDS } from '~/admin/lib/protocol/types/splash-editor-ops'
import type { SplashEditorOpKind } from '~/admin/lib/protocol/types/splash-editor-ops'
import type {
  CapabilityFlag,
  ConditionKind,
  EntityClass,
} from '~/shared/features/cms/editableSurface/types'

/**
 * One concrete registry address an op writes.
 *
 * `capability` is what the REGISTRY must report for it — not what the op wishes
 * it were. Anything other than `agent-writable` is a departure that has to
 * carry a `reason`, and the test rejects a claim whose capability no longer
 * matches, so a registry edit that opens or closes an address surfaces here as
 * a failing assertion rather than as a silent capability change.
 */
export interface OpAddressClaim {
  /** Entity class; the scope is `*` unless `scopedByType` says otherwise. */
  readonly entity: EntityClass
  readonly path: string
  readonly capability: CapabilityFlag
  /** Required unless `capability` is `agent-writable`. */
  readonly reason?: string
  /**
   * Present when the entry's capability is CONDITIONAL: the registry entry must
   * declare exactly these conditions, in this order, and `capability` is what it
   * resolves to when at least one of them holds.
   */
  readonly conditional?: readonly ConditionKind[]
}

/**
 * A whole family of addresses — every registry entry of `entity` whose path
 * matches — because the op's payload names schema-declared ids the registry
 * enumerates per block type or per section type.
 */
export interface OpAddressFamily {
  readonly label: string
  readonly entity: EntityClass
  readonly path: RegExp
  /**
   * Every capability the family's matched entries may carry. A family that
   * lists anything beyond `agent-writable` is claiming the op can reach an
   * address the registry does not open to an agent, and must say why in `note`.
   * The test also refuses a listed capability that no matched entry carries, so
   * an over-broad declaration cannot sit here unnoticed.
   */
  readonly capabilities: readonly CapabilityFlag[]
  readonly note?: string
  readonly conditional?: readonly ConditionKind[]
}

export interface OpAddressSurface {
  /** One sentence: what this op writes. */
  readonly writes: string
  readonly addresses?: readonly OpAddressClaim[]
  readonly families?: readonly OpAddressFamily[]
  /**
   * Effects that are NOT field addresses — creating or deleting rows, changing
   * membership, order or selection. The registry models fields, so these are
   * stated rather than checked; an op whose whole surface is structural
   * declares no addresses at all.
   */
  readonly structural?: string
}

const sectionPresentation: readonly OpAddressClaim[] = SPLASH_SECTION_PRESENTATION_FIELDS.map(
  path => ({ entity: 'section', path, capability: 'agent-writable' } as const),
)

/**
 * `sectionType` is `author-only` in the registry because a bare column write
 * skips the re-planning endpoint that moves blocks between roles. Both ops
 * below ARE that route (create has nothing to re-plan; `change_section_type`
 * calls the endpoint), which is exactly what the entry's own guidance names.
 */
const sectionTypeClaim: OpAddressClaim = {
  entity: 'section',
  path: 'sectionType',
  capability: 'author-only',
  reason: 'the entry is author-only because a bare column write skips block re-planning; '
    + 'this op is the re-planning route the entry\'s guidance points at',
}

/**
 * Block settings, by every op that writes one.
 *
 * `migration-only` is in the list because it is REACHABLE today, not because it
 * should be: the executor gates block writes on `blockSettingIds`, which is
 * every declared id of the schema — it does not filter by capability, so an
 * `internal: true` id is writable through `update_block_settings`. The registry
 * says otherwise. Closing it is a server-side capability check (D3/P2), not a
 * new client gate that the API would still accept around.
 */
const blockSettingsNote = 'reachable, not intended: the executor gates on declared setting ids '
  + '(facade.blockSettingIds), which does not filter by capability, so an internal/hidden '
  + 'setting is writable. The registry is the statement of what should be allowed; enforcing '
  + 'it belongs to the server (D3/P2).'

const blockSettings = (label: string, note = blockSettingsNote): OpAddressFamily => ({
  label,
  entity: 'block',
  // Every block-scoped setting id. Dotless by construction, which is also what
  // excludes the two structured paths the registry mints beside them
  // (`<id>.custom`, `placement.canvas`) — both have their own claims.
  path: /^[^.]+$/,
  capabilities: ['agent-writable', 'migration-only'],
  note,
})

/**
 * THE declaration. Every kind of `SPLASH_EDITOR_OP_KINDS`, exactly once.
 */
export const OP_ADDRESS_SURFACE: Readonly<Record<SplashEditorOpKind, OpAddressSurface>> = {
  // ── Sections ──
  add_section: {
    writes: 'a new section row, its type and the presentation columns the op carries',
    addresses: [
      { entity: 'section', path: 'name', capability: 'agent-writable' },
      { entity: 'section', path: 'colorScheme', capability: 'agent-writable' },
      { entity: 'section', path: 'containerMode', capability: 'agent-writable' },
      sectionTypeClaim,
    ],
    families: [blockSettings(
      'preset block settings on the with-blocks create path',
      'the preset path writes each block\'s settings verbatim and checks no declared id at '
      + 'all — unlike update_block_settings. Its payload surface is every key the model sends; '
      + 'registry-checking it is a behaviour change deferred to server enforcement (P2).',
    )],
    structural: 'creates the section (and, on the preset path, its blocks); `position` is applied '
      + 'as a follow-up reorder_sections, not as a column write',
  },

  update_section: {
    writes: 'the section presentation columns, and only those',
    addresses: sectionPresentation,
  },

  change_section_type: {
    writes: 'the section type, through the re-planning endpoint',
    addresses: [sectionTypeClaim],
    structural: 're-plans block placement: blocks lose or gain layoutRole assignments',
  },

  delete_section: {
    writes: 'nothing — it removes the section row and cascades its blocks',
    structural: 'deletes the section and every block in it, and clears the undo history',
  },

  reorder_sections: {
    writes: 'the whole-page section order',
    addresses: [{
      entity: 'section',
      path: 'position',
      capability: 'author-only',
      reason: 'the entry is author-only so a single position cannot be poked; this op writes the '
        + 'COMPLETE order, which is the route its guidance names',
    }],
  },

  duplicate_section: {
    writes: 'nothing — the server copies the section and its blocks',
    structural: 'creates a section row and block rows, and clears the undo history',
  },

  update_layout_config: {
    writes: 'the layoutConfig keys the section\'s own type declares',
    families: [{
      label: 'section layoutConfig',
      entity: 'section',
      path: /^layoutConfig\./,
      capabilities: ['agent-writable'],
    }],
  },

  // ── Blocks ──
  add_block: {
    writes: 'a new block row and the settings the op carries',
    families: [blockSettings(
      'settings on create',
      'add_block checks no declared id (see the add_section note); same deferral.',
    )],
    structural: 'creates the block, assigns its section and layoutRole, and selects it',
  },

  update_block_settings: {
    writes: 'declared settings of the target block, merged over its current ones',
    families: [blockSettings('block settings')],
  },

  set_block_field: {
    writes: 'one declared setting of the target block, by path',
    families: [blockSettings('block setting, addressed by path')],
    structural: 'the path may nest BELOW a declared id, which no schema describes and the '
      + 'registry therefore does not model',
  },

  attach_media: {
    writes: 'one media-typed setting of the target block',
    families: [{
      label: 'block media fields',
      entity: 'block',
      path: /^[^.]+$/,
      capabilities: ['agent-writable', 'migration-only'],
      note: 'the media-ref constraint is what narrows this at runtime; the path family cannot '
        + 'express "entries whose constraint is media-ref", so the test filters on the '
        + 'constraint kind for this op.',
    }],
  },

  delete_block: {
    writes: 'nothing — it removes the block row',
    structural: 'deletes the block',
  },

  reorder_blocks: {
    writes: 'the page-global block order',
    structural: 'writes an order of block ids; position is not an editable-surface address',
  },

  move_block: {
    writes: 'nothing addressable — section membership, order and layoutRole',
    structural: 'section membership, position and layoutRole are graph edges, not fields; the '
      + 'registry models fields. Persists every block on the page through replace-all.',
  },

  set_block_placement: {
    writes: 'the target block\'s canvas geometry',
    addresses: [{
      entity: 'block',
      path: 'placement.canvas',
      capability: 'agent-writable',
      // BOTH routes `canvasPlacementPolicy.ts` answers, as the any-of the
      // registry entry declares: a section type with a layered slot on an
      // ordinary page, or a brand-canvas page, which is free placement end to
      // end and qualifies every block on it regardless of section type. The
      // executor passes `pageType` into the kernel, so the registry's verdict
      // and the shared predicate's now agree instead of the former having to be
      // discarded on the brand-canvas branch.
      conditional: ['section-type-has-layered-slot', 'page-is-brand-canvas'],
    }],
  },

  // ── Page / theme / typography ──
  update_page_settings: {
    writes: 'page columns named in the patch',
    addresses: [
      { entity: 'page', path: 'title', capability: 'agent-writable' },
      { entity: 'page', path: 'noIndex', capability: 'agent-writable' },
      // slug and status are agent-writable because the deployed R2
      // update_page_settings tool sends them by contract (WALLE
      // site-write.ts); the never-slug rule lives in the prefill adapters,
      // a different surface.
      { entity: 'page', path: 'slug', capability: 'agent-writable' },
      { entity: 'page', path: 'status', capability: 'agent-writable' },
      // The op's patch carries NO allowlist — unlike update_section, whose
      // presentation allowlist the executor re-checks. Every author-only column
      // is therefore reachable, and the registry is the only place that says it
      // should not be. Listed so the gap is declared rather than discovered.
      ...(['canonicalUrl', 'parentId', 'templateId', 'requireAuth', 'published'] as const)
        .map(path => ({
          entity: 'page' as const,
          path,
          capability: 'author-only' as const,
          reason: 'reachable, not intended: update_page_settings applies its patch with no '
            + 'allowlist. Server-side capability enforcement (D3/P2) is the gate.',
        })),
    ],
  },

  update_theme_settings: {
    writes: 'theme manifest settings named in the patch',
    addresses: [{
      entity: 'theme',
      path: 'colorRoles',
      capability: 'author-only',
      reason: 'reachable, not intended: the patch carries no allowlist, and colour-role bindings '
        + 'repaint an entire site in one write. Server-side enforcement is the gate.',
    }],
    families: [{
      label: 'theme manifest settings',
      entity: 'theme',
      path: /^(?!colorRoles$)[^.]+$/,
      // Narrower than the block families on purpose: the reference theme's
      // manifest declares no `internal` or `hidden` setting, so there is no
      // migration-only theme address to reach. A theme that adds one fails this
      // family rather than being pre-authorised by a speculative flag.
      capabilities: ['agent-writable'],
    }],
  },

  update_layout_settings: {
    writes: 'the settings the named layout type\'s component schema declares',
    families: [{
      label: 'layout component settings',
      entity: 'layout',
      // Dotless by construction, like the block families: a layout schema
      // declares flat setting ids, and nesting below one is field-shaped.
      path: /^[^.]+$/,
      capabilities: ['agent-writable'],
      note: 'the family is WIDER than the op: the registry mints an entry for every '
        + 'layout-component schema in the theme, while the op\'s `layoutType` enum admits only '
        + 'header and footer. A theme\'s extra layout component (the reference theme\'s '
        + 'search-bar) is therefore described but unreachable, which is the safe direction — '
        + 'the registry describes the surface and the protocol narrows it.',
    }],
  },

  update_typography_preset: {
    writes: 'one typography preset',
    addresses: [{ entity: 'typography', path: 'presets', capability: 'agent-writable' }],
  },

  set_typography_roles: {
    writes: 'the complete typography role map',
    addresses: [{ entity: 'typography', path: 'roles', capability: 'agent-writable' }],
  },

  // ── Selection ──
  select: {
    writes: 'nothing',
    structural: 'moves the editor selection; no persisted state changes',
  },
}
