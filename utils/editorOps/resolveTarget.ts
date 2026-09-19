import { resolveByLabel } from '~/admin/utils/prefill/labelResolution'
import type { SplashEditorRef } from '~/admin/lib/protocol/types/splash-editor-ops'
import type { SplashEditorSelection } from '~/admin/lib/protocol/types/splash-editor-context'

export type TargetScope = 'block' | 'section'

export interface TargetContext {
  scope: TargetScope
  sections: readonly { id: string, name: string }[]
  blocks: readonly { id: string, label: string }[]
  /** ref name → concrete id, populated by earlier ops in the same batch. */
  refs: ReadonlyMap<string, string>
  selection: Pick<SplashEditorSelection, 'mode' | 'blockId' | 'sectionId' | 'activeSectionId'>
}

export type TargetResult =
  | { ok: true, id: string }
  | { ok: false, reason: string }

const MISSING = { ok: false, reason: 'target no longer exists' } as const

function candidates(ctx: TargetContext): readonly { id: string, label: string }[] {
  return ctx.scope === 'block'
    ? ctx.blocks
    : ctx.sections.map(s => ({ id: s.id, label: s.name }))
}

/**
 * Turn a model-supplied reference into a concrete id (spec §4.3, spec line 322).
 * The executor rebuilds `ctx` from the LIVE store before resolving each op, so
 * `known` below always reflects everything that exists at THIS moment — an
 * entity an earlier op in the same batch just created is already present,
 * and one a later op deletes is no longer present on the next resolve. Under
 * that contract EVERY path, `by: 'ref'` included, is membership-checked
 * against `known`: the model may never invent an id, and a ref that happens
 * to point at an id outside the current scope (e.g. a block id used to
 * target a section-scoped op) must fail rather than silently succeed.
 */
export function resolveTarget(ref: SplashEditorRef, ctx: TargetContext): TargetResult {
  const known = candidates(ctx)
  const exists = (id: string) => known.some(c => c.id === id)

  switch (ref.by) {
    case 'id':
      return exists(ref.id) ? { ok: true, id: ref.id } : MISSING

    case 'label': {
      // Exact-normalized, never fuzzy: a wrong silent match writes to the wrong
      // block, which is worse than an op the operator can see was skipped.
      // Candidates with an empty normalized label are excluded — a
      // whitespace-only query must not exact-match an unlabeled row.
      const labeled = known.filter(c => normalizeNonEmpty(c.label))
      const match = resolveByLabel(labeled, ref.label, c => c.label)
      return match
        ? { ok: true, id: match.id }
        : { ok: false, reason: `no unique match for label "${ref.label}"` }
    }

    case 'ref': {
      const id = ctx.refs.get(ref.ref)
      if (id === undefined) {
        return { ok: false, reason: `ref "${ref.ref}" was not produced by an earlier op` }
      }
      // Same rule as every other path: the ref's id must exist in the
      // current scope's live candidates, so a ref produced by an op outside
      // this op's scope (or one deleted later in the batch) cannot resolve.
      return exists(id) ? { ok: true, id } : MISSING
    }

    case 'selection': {
      if (ctx.scope === 'block') {
        // Never widens to "the section" or "the page" [R14].
        if (ctx.selection.mode !== 'block' || !ctx.selection.blockId) {
          return { ok: false, reason: 'no block is selected' }
        }
        return exists(ctx.selection.blockId) ? { ok: true, id: ctx.selection.blockId } : MISSING
      }
      const sectionId = ctx.selection.mode === 'section'
        ? ctx.selection.sectionId
        : ctx.selection.activeSectionId
      if (!sectionId) return { ok: false, reason: 'no section is selected' }
      return exists(sectionId) ? { ok: true, id: sectionId } : MISSING
    }

    default: {
      // Exhaustiveness guard: if a new SplashEditorRef variant lands without a
      // case here, fail this one op loudly rather than throw a TypeError that
      // would unwind the whole batch executor loop.
      const exhaustive: never = ref
      return { ok: false, reason: `unresolvable ref kind: ${JSON.stringify(exhaustive)}` }
    }
  }
}

function normalizeNonEmpty(label: string): boolean {
  return label.trim().length > 0
}
