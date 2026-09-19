import { validateSettingValues } from '~/admin/utils/editorOps/settingsValueValidation'
import { resolveByLabel } from '~/admin/utils/prefill/labelResolution'
import { resolveTarget, type TargetContext, type TargetScope } from '~/admin/utils/editorOps/resolveTarget'
import { validate } from '~/shared/features/cms/editableSurface/validateAddress'
import { canvasGeometryAllowed } from '~/admin/utils/canvasPlacementPatch'
import { SPLASH_SECTION_PRESENTATION_FIELDS } from '~/admin/lib/protocol/types/splash-editor-ops'
import type { SplashEditorOp, SplashEditorRef } from '~/admin/lib/protocol/types/splash-editor-ops'
import type { EditorOpsFacade, FacadeBlock } from '~/admin/utils/editorOps/facade'
import type {
  EditableAddress,
  ValidationContext,
  ValidationIssue,
} from '~/shared/features/cms/editableSurface/types'

/**
 * `producedId` is "the entity this op created or TOUCHED", not strictly a new
 * one: `update_section` and `change_section_type` report the target they acted
 * on so a later op's `{ by: 'ref' }` can point at it. A driver binding `op.ref`
 * must therefore treat it as an identity, never as proof something was created.
 */
export type OpOutcome =
  | { status: 'applied', opId: string, summary: string, producedId?: string, warnings?: string[] }
  | { status: 'failed', opId: string, reason: string }
  | { status: 'needs-confirm', opId: string, message: string }

/**
 * Keys `update_section` must never carry. The presentation allowlist below
 * already excludes both, so this is not a second gate — it buys a message that
 * names the op which does handle them (change_section_type / reorder_sections)
 * instead of the generic "not a presentation field" [R9].
 */
const FORBIDDEN_SECTION_PATCH_KEYS: Readonly<Record<string, string>> = {
  sectionType: 'change_section_type',
  position: 'reorder_sections',
}

type SectionOp = Extract<SplashEditorOp, {
  kind: 'add_section' | 'update_section' | 'change_section_type'
    | 'delete_section' | 'reorder_sections' | 'duplicate_section' | 'update_layout_config'
}>

type BlockOp = Extract<SplashEditorOp, {
  kind: 'add_block' | 'update_block_settings' | 'set_block_field'
    | 'delete_block' | 'reorder_blocks' | 'move_block' | 'attach_media'
    | 'set_block_placement'
}>

/**
 * The registry-checked ops' shared refusal path (D8).
 *
 * The kernel returns an ISSUE LIST, and warnings are not refusals: a fail-open
 * entry reports "unverified", which is a reason to proceed, not to stop. Only
 * errors decide the op. The first message leads and the rest are counted,
 * because the report slices every reason at 200 characters and a list that
 * stops mid-message reads as a complete one.
 */
function firstError(issues: readonly ValidationIssue[]): string | null {
  const errors = issues.filter(issue => issue.severity === 'error')
  const first = errors[0]
  if (!first) return null
  return errors.length === 1 ? first.message : `${first.message} (and ${errors.length - 1} more)`
}

/**
 * Schema field types whose value is a media reference.
 *
 * A deliberate MIRROR of `MEDIA_FIELD_TYPES` in
 * `server/services/media/mediaValueValidation.ts`, not an import: that module
 * pulls in `themeDiscovery`, which reads the filesystem, and nothing on the
 * server side may be dragged into the admin bundle for a five-string set. The
 * two lists are pinned to each other by a drift test — if the server learns a
 * new media field type and this does not, `attach_media` refuses a field the
 * API would have accepted, which is the safe direction but still a bug.
 */
const MEDIA_FIELD_TYPES: ReadonlySet<string> = new Set([
  'image', 'media', 'video', 'image-gallery', 'gallery',
])
/** Of those, the ones whose value is a LIST rather than one reference. */
const GALLERY_FIELD_TYPES: ReadonlySet<string> = new Set(['image-gallery', 'gallery'])

type SettingsOp = Extract<SplashEditorOp, {
  kind: 'update_page_settings' | 'update_theme_settings' | 'update_layout_settings'
    | 'update_typography_preset' | 'set_typography_roles'
}>

type SelectOp = Extract<SplashEditorOp, { kind: 'select' }>

/**
 * Built from the LIVE store on every resolve, never cached across ops: an
 * entity an earlier op created must already be a candidate, and one a later op
 * deletes must stop resolving.
 */
function targetContext(facade: EditorOpsFacade, scope: TargetScope, refs: ReadonlyMap<string, string>): TargetContext {
  return {
    scope,
    sections: facade.sections(),
    blocks: facade.blocks(),
    refs,
    selection: facade.selection(),
  }
}

function fail(opId: string, reason: string): OpOutcome {
  return { status: 'failed', opId, reason }
}

/**
 * The declared setting id a `fieldPath` writes into — everything before the
 * first `.` or `[`. Only the first segment is checkable against a schema:
 * nesting below a declared id is field-shaped and the schema does not describe
 * it. Empty when the path starts with a separator, which names no setting.
 */
function rootSegment(fieldPath: string): string {
  return fieldPath.split(/[.[]/, 1)[0] ?? ''
}

function resolve(
  ref: SplashEditorRef, facade: EditorOpsFacade, scope: TargetScope,
  refs: ReadonlyMap<string, string>, opId: string,
): { id: string } | OpOutcome {
  const result = resolveTarget(ref, targetContext(facade, scope, refs))
  return result.ok ? { id: result.id } : fail(opId, result.reason)
}

/** Generic over the success shape: resolvers return an id, a permutation, … */
function isOutcome<T extends object>(value: T | OpOutcome): value is OpOutcome {
  return 'status' in value
}

/**
 * Resolve every ref of a reorder array and assert it is a FULL PERMUTATION of
 * the current id set [R4].
 *
 * The protocol guarantees only **≥2 distinct refs** — "distinct" is not
 * "complete", so this check is entirely the host's. A partial array is not a
 * cosmetic mistake: `reorderBlocks` writes a page-global order and
 * `blocks/replace-all` persists whatever the store holds, so applying it to the
 * subset is permanent block loss.
 */
function resolvePermutation(
  order: readonly SplashEditorRef[], currentIds: readonly string[],
  facade: EditorOpsFacade, scope: TargetScope, refs: ReadonlyMap<string, string>,
  opId: string, noun: string,
): { ids: string[] } | OpOutcome {
  const ids: string[] = []
  for (const ref of order) {
    const resolved = resolve(ref, facade, scope, refs, opId)
    if (isOutcome(resolved)) return resolved
    ids.push(resolved.id)
  }
  const unique = new Set(ids)
  if (unique.size !== ids.length || unique.size !== currentIds.length
    || currentIds.some(id => !unique.has(id))) {
    return fail(opId, `reorder must list every ${noun} exactly once (expected ${currentIds.length}, got ${unique.size})`)
  }
  return { ids }
}

/**
 * Why success is a POST-CONDITION and never "the error ref did not change".
 *
 * `sectionStore.deleteSection` and `reorderSections` return void, and both have
 * guard-returns that fire BEFORE `error.value = null`: no active site, the page
 * switched under the op, a structural operation already in flight
 * (`hasOperation`), or a refused job flush. On every one of those they record
 * NOTHING and do NOTHING. Inferring success from a quiet error ref therefore
 * reports a delete that never happened — and for `delete_section` that verdict
 * arrives after the executor has already destroyed the section's blocks and is
 * about to clear the undo history that could bring them back.
 *
 * So: read the live store back and require the intended state. The error ref is
 * consulted only to SOURCE a reason once the post-condition has already ruled
 * the op failed. Sampling it before the call distinguishes a store that ran and
 * recorded a fresh failure from one that silently declined — the store clears
 * `error` after its guards, so an unchanged ref means the action never ran.
 */
async function runVoidAction(
  readError: () => string | null,
  action: () => Promise<void>,
  applied: () => boolean,
  declined: string,
): Promise<string | null> {
  const before = readError()
  await action()
  if (applied()) return null
  const after = readError()
  return after !== null && after !== before ? after : declined
}

/**
 * The value-returning actions signal the SAME guards by returning null without
 * recording anything, so null plus an unchanged error ref is transient
 * contention the model should retry, while null plus a fresh error is a genuine
 * rejection it should not.
 */
async function runValueAction<T extends object>(
  readError: () => string | null,
  action: () => Promise<T | null>,
  declined: string,
): Promise<{ value: T } | { reason: string }> {
  const before = readError()
  const value = await action()
  if (value) return { value }
  const after = readError()
  return { reason: after !== null && after !== before ? after : declined }
}

function isRejection<T extends object>(
  result: { value: T } | { reason: string },
): result is { reason: string } {
  return 'reason' in result
}

/** Live section order, by position — what a reorder post-condition compares to. */
function orderedSectionIds(facade: EditorOpsFacade): string[] {
  return [...facade.sections()].sort((a, b) => a.position - b.position).map(s => s.id)
}

/**
 * Live page-global block order — the store's ARRAY ORDER, deliberately NOT
 * sorted by the `position` field.
 *
 * `position` is advisory and goes stale: `removeBlockFromState` filters without
 * renumbering, and `createBlock` with a null position does a bare `push` while
 * the server stamps `position = blocks.value.length`. Delete two blocks and
 * append one and the survivor carries a HIGHER position than the block appended
 * after it — sorting by position then reports an order the page does not have,
 * and every splice index derived from it lands in the wrong place.
 *
 * The array is the authoritative order: it is what the editor renders, what
 * `blocks/replace-all` persists, and what `reorderBlocks` rewrites. A sort by
 * `position` can only ever disagree with it, never correct it.
 */
function orderedBlocks(facade: EditorOpsFacade): FacadeBlock[] {
  return [...facade.blocks()]
}

/**
 * A section's blocks in page-global position order. The store keeps ONE flat
 * ordered array for the page and a section is a filter over it, exactly as the
 * editor's own section list treats it — so a "section-local index" only ever
 * exists as a derived view, and every store call takes the global position.
 */
function sectionBlocks(facade: EditorOpsFacade, sectionId: string): FacadeBlock[] {
  return orderedBlocks(facade).filter(b => b.sectionId === sectionId)
}

/**
 * The page / theme / layout / typography writers are NOT void and do NOT report
 * through an error ref: they return the persisted value and THROW on failure.
 * A defined return is therefore the post-condition, and `undefined` means one of
 * their silent `if (!siteId.value) return` guards fired — nothing was written
 * and nothing was recorded, which is precisely the case an error-ref check would
 * have read as success.
 */
async function runThrowingAction<T>(
  action: () => Promise<T | null | undefined>,
  declined: string,
  fallback: string,
): Promise<{ value: T } | { reason: string }> {
  try {
    const value = await action()
    return value === null || value === undefined ? { reason: declined } : { value }
  }
  catch (err) {
    return { reason: err instanceof Error ? err.message : fallback }
  }
}

/**
 * SITE-GLOBAL ops (theme, layout, typography) carry no page id, so the driver's
 * wrong-page batch drop — which compares the batch's declared page to the open
 * one at batch START — does not scope them at all: the operator can navigate
 * while the batch is mid-flight, and a theme write would then land on whatever
 * site is now open with nothing in the op to say otherwise.
 *
 * So a site-wide write requires the batch's page anchor and refuses when the
 * editor has moved off it. `undefined` fails too, deliberately: a guard that
 * defaults to permissive is not a guard, and a driver that forgets to pass the
 * anchor must find out loudly rather than by writing to the wrong site.
 *
 * Page-scoped ops are excluded on purpose — they name their page (or resolve
 * their targets against the live page graph, which stops resolving after a
 * navigation), so they already carry the scope this reconstructs.
 *
 * Known over-refusal: the anchor is a PAGE id standing in for a SITE identity,
 * because the facade exposes no site. Navigating between two pages of the same
 * site refuses a write that would have been correct. That direction is the safe
 * one — the alternative is theme settings landing on the wrong site — but a
 * `siteId()` on the facade would let this compare what it actually means.
 */
function siteGlobalAnchorFailure(
  opId: string, facade: EditorOpsFacade, batchPageId: string | undefined,
): OpOutcome | null {
  if (batchPageId === undefined) {
    return fail(opId, 'this change applies to the whole site, and the host cannot prove the editor is still where the batch was composed')
  }
  return pageAnchorFailure(opId, facade, batchPageId)
}

/**
 * The same drift check for ops that DO name a page but read it live.
 * `update_page_settings` passes `facade.pageId()` straight to the store, so a
 * navigation between two ops of one batch silently redirects "rename this page"
 * or "rewrite its SEO" onto whatever page is now open — and it would be
 * reported as applied, because the write genuinely succeeded, just not where
 * the model meant.
 *
 * Permissive on `undefined`, unlike the site-global gate: a page-scoped op
 * without an anchor is exactly the pre-anchor behaviour, whereas a site-global
 * one without an anchor has no scope at all.
 */
function pageAnchorFailure(
  opId: string, facade: EditorOpsFacade, batchPageId: string | undefined,
): OpOutcome | null {
  if (batchPageId !== undefined && facade.pageId() !== batchPageId) {
    return fail(opId, 'the editor moved to another page while the batch was running — this change is not applied against a shifted context')
  }
  return null
}

/**
 * `SplashEditorOpsReportSchema` caps every reason and warning at 200 characters
 * and the driver enforces it by SLICING. A label list built without a budget
 * therefore stops mid-name and still reads as a complete inventory — which on a
 * destructive path is the one place a half-truth is worse than a short answer.
 */
const MAX_CONFIRM_MESSAGE = 200

/**
 * How much of a section name a message may spend. Names are bounded at 120 by
 * the schema, which alone can push a message past the slice and take the
 * recovery instruction with it.
 */
const MAX_NAME_IN_MESSAGE = 60

function clamp(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

/**
 * As many labels as `budget` allows, the rest summarised by count. Reserves room
 * for its own "and N more" before deciding a label fits, so the summary can never
 * be the thing that overflows.
 */
function fitLabels(labels: readonly string[], budget: number): string {
  const kept: string[] = []
  let used = 0
  for (const [index, label] of labels.entries()) {
    const left = labels.length - index
    // Nothing to reserve on the last label: if it fits there is no remainder.
    const reserve = left > 1 ? `, and ${left - 1} more`.length : 0
    const cost = (kept.length ? 2 : 0) + label.length
    if (used + cost + reserve > budget) {
      // Not even one label fits: return NOTHING rather than a bare "and 3 more",
      // which reads as a truncated list when the caller has already stated the
      // count. The caller drops the list clause entirely.
      return kept.length ? `${kept.join(', ')}, and ${left} more` : ''
    }
    kept.push(label)
    used += cost
  }
  return kept.join(', ')
}

/**
 * What a partly-applied destructive op already destroyed, in the failure reason
 * itself. The operator is the only one who can act on it, and by this point
 * nothing else in the system still knows these blocks existed.
 */
function withLoss(base: string, destroyed: readonly FacadeBlock[]): string {
  if (destroyed.length === 0) return base
  const noun = destroyed.length === 1 ? 'block' : 'blocks'
  const verb = destroyed.length === 1 ? 'was' : 'were'
  // The count leads and the labels are budgeted, so a long list degrades to
  // "and N more" instead of being cut mid-name by the report's 200-char slice.
  const head = `${base}. ${destroyed.length} ${noun}`
  const rest = ` ${verb} already deleted and cannot be restored.`
  const labels = fitLabels(
    destroyed.map(b => b.label),
    MAX_CONFIRM_MESSAGE - head.length - rest.length - 3,
  )
  // No label fits: the count alone, rather than an empty pair of parentheses.
  return labels ? `${head} (${labels})${rest}` : `${head}${rest}`
}

function arrayEquals(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Prefix for every "the store declined without saying why" reason. All four
 * silent guards are transient or context-shifted rather than a rejection of the
 * content, so the model is told it may retry.
 */
const DECLINED = 'the editor was busy with another change and'

async function applySectionOp(
  op: SectionOp, opId: string, facade: EditorOpsFacade, refs: ReadonlyMap<string, string>,
  batchPageId: string | undefined,
): Promise<OpOutcome> {
  // Every section op reads its page id live, so a navigation that happened
  // before this op started would silently retarget the whole family. This
  // closes the PRE-call half of that gap; an op already in flight when the
  // operator navigates still needs the driver's per-op re-check (Task 9).
  const anchor = pageAnchorFailure(opId, facade, batchPageId)
  if (anchor) return anchor
  const pageId = facade.pageId()
  const readSectionError = () => facade.readSectionError()

  switch (op.kind) {
    case 'add_section': {
      if (op.sectionType && !facade.knownSectionTypes().includes(op.sectionType)) {
        return fail(opId, `unknown section type "${op.sectionType}"`)
      }
      for (const block of op.blocks ?? []) {
        if (!facade.knownBlockTypes().includes(block.type)) {
          return fail(opId, `unknown block type "${block.type}"`)
        }
        if (block.layoutRole && !facade.knownLayoutRoles().includes(block.layoutRole)) {
          return fail(opId, `unknown layout role "${block.layoutRole}"`)
        }
      }

      // With blocks: one server transaction (sections/with-blocks). Without:
      // the plain create. Two paths, one op — the model should not have to know.
      // The preset path records into editorStore's own error ref, not the
      // section store's, so each path samples the ref its action writes.
      const create = op.blocks?.length
        ? await runValueAction(
          () => facade.readEditorError(),
          () => facade.createSectionFromPreset(pageId, {
            ...(op.sectionType ? { sectionType: op.sectionType } : {}),
            ...(op.colorScheme ? { colorScheme: op.colorScheme } : {}),
            ...(op.containerMode ? { containerMode: op.containerMode } : {}),
            blocks: op.blocks,
          }, op.name),
          `${DECLINED} did not create the section — retry`,
        )
        : await runValueAction(
          readSectionError,
          () => facade.createSection(pageId, {
            name: op.name,
            ...(op.sectionType ? { sectionType: op.sectionType } : {}),
            ...(op.colorScheme ? { colorScheme: op.colorScheme } : {}),
            ...(op.containerMode ? { containerMode: op.containerMode } : {}),
          }),
          `${DECLINED} did not create the section — retry`,
        )
      if (isRejection(create)) return fail(opId, create.reason)
      const created = create.value

      // Past this point the section EXISTS. Everything that follows is a
      // refinement of it, and a refinement that fails must still report the id:
      // a bare failure would leave the driver unable to bind `op.ref` and the
      // model likely to retry the create, duplicating the section [MAJOR 3].
      const warnings: string[] = []

      // `position` is applied as a follow-up reorder [R6]: neither create path
      // takes an index, and the section lands last.
      if (op.position !== undefined) {
        const rest = facade.sections().map(s => s.id).filter(id => id !== created.id)
        const index = Math.min(op.position, rest.length)
        const ordered = [...rest.slice(0, index), created.id, ...rest.slice(index)]
        const reason = await runVoidAction(
          readSectionError,
          () => facade.reorderSections(pageId, ordered),
          () => arrayEquals(orderedSectionIds(facade), ordered),
          `${DECLINED} did not reorder the sections`,
        )
        if (reason !== null) {
          warnings.push(`the section was created but could not be moved to position ${op.position}: ${reason}`)
        }
      }
      if (!await facade.selectSection(created.id)) {
        // selectSection returns false when the inspector refuses to flush; the
        // section is still created, so this is a warning, not a failure.
        warnings.push('the section was created but could not be selected')
      }
      return {
        status: 'applied', opId, summary: `Added section "${op.name}"`, producedId: created.id,
        ...(warnings.length ? { warnings } : {}),
      }
    }

    case 'update_section': {
      // The protocol delivers `patch` as Record<string, unknown>, already
      // allowlist-constrained at the tool boundary. The host re-checks anyway
      // [R9]: a future protocol edit that widened the allowlist would otherwise
      // reach sectionStore.updateSection, and `sectionType` / `position` there
      // bypass the type-change and reorder ops that exist to handle them.
      const forbidden = Object.keys(FORBIDDEN_SECTION_PATCH_KEYS).find(key => key in op.patch)
      if (forbidden) {
        return fail(opId, `update_section cannot change "${forbidden}" — use ${FORBIDDEN_SECTION_PATCH_KEYS[forbidden]}`)
      }
      const unknown = Object.keys(op.patch).find(
        key => !(SPLASH_SECTION_PRESENTATION_FIELDS as readonly string[]).includes(key),
      )
      if (unknown) return fail(opId, `"${unknown}" is not a section presentation field`)

      const target = resolve(op.target, facade, 'section', refs, opId)
      if (isOutcome(target)) return target
      const updated = await runValueAction(
        readSectionError,
        () => facade.updateSection(pageId, target.id, op.patch),
        `${DECLINED} did not update the section — retry`,
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : { status: 'applied', opId, summary: 'Updated section presentation', producedId: target.id }
    }

    case 'change_section_type': {
      if (!facade.knownSectionTypes().includes(op.sectionType)) {
        return fail(opId, `unknown section type "${op.sectionType}"`)
      }
      const target = resolve(op.target, facade, 'section', refs, opId)
      if (isOutcome(target)) return target
      try {
        const result = await facade.changeSectionType(pageId, target.id, op.sectionType)
        return {
          status: 'applied', opId, producedId: target.id,
          summary: `Changed section type to ${op.sectionType}`,
          ...(result.warning ? { warnings: [result.warning] } : {}),
        }
      }
      catch (err) {
        return fail(opId, err instanceof Error ? err.message : 'section type change failed')
      }
    }

    case 'delete_section': {
      const target = resolve(op.target, facade, 'section', refs, opId)
      if (isOutcome(target)) return target
      const section = facade.sections().find(s => s.id === target.id)
      // resolveTarget membership-checks against the same live list, so this is
      // unreachable — but fail the op rather than assert the section away.
      if (!section) return fail(opId, 'target no longer exists')
      // Loss inventory from the LIVE store, never the digest: the digest may
      // have trimmed this section's blocks, and phase 1 must always be exact.
      const members = facade.blocks().filter(b => b.sectionId === target.id)

      // The runtime passes `confirm` through untouched and neither inspects nor
      // gates it — the whole two-phase handshake is host-side [R7]. Phase 1 is
      // therefore the only thing standing between one injected model decision
      // and unrecoverable content loss; it must never be skipped or inferred.
      if (!op.confirm) {
        const tail = ' This cannot be undone. Ask the user to confirm, then resend with confirm: true.'
        // The NAME is clamped as well as the labels. Section names run to 120
        // characters by schema, which on its own pushes the message past the
        // report's 200-character slice and cuts the tail — losing "resend with
        // confirm: true", the one instruction that tells the model how to
        // proceed. Losing the end of a long name costs nothing by comparison.
        const name = clamp(section.name, MAX_NAME_IN_MESSAGE)
        if (members.length === 0) {
          return {
            status: 'needs-confirm', opId,
            message: `Deleting "${name}" deletes no blocks.${tail}`,
          }
        }
        // The COUNT sits ahead of the labels on purpose: it is the one number the
        // operator must weigh, so it survives even a hard cut, and the labels
        // degrade to "and N more" rather than stopping mid-name and reading as a
        // complete inventory.
        const head = `Deleting "${name}" also deletes ${members.length} block${members.length === 1 ? '' : 's'}`
        const budget = MAX_CONFIRM_MESSAGE - head.length - tail.length - 3
        const labels = fitLabels(members.map(b => b.label), budget)
        return {
          status: 'needs-confirm', opId,
          // No label fits: state the count and stop. A bare ": and 3 more"
          // reads as a truncated list when the count is already there.
          message: labels ? `${head}: ${labels}.${tail}` : `${head}.${tail}`,
        }
      }

      // Executor-side cascade (ruling A): sectionStore.deleteSection removes
      // only the section row and the server has no FK on blocks.sectionId, so
      // members would be orphaned. deleteSection itself stays untouched.
      //
      // Every iteration is irreversible, so a failure mid-cascade has to name
      // what is already gone — the operator is the last party that still knows
      // those blocks existed [MAJOR 4].
      const destroyed: FacadeBlock[] = []
      for (const block of members) {
        if (!await facade.deleteBlock(block.id)) {
          return fail(opId, withLoss(`could not delete block ${block.id}`, destroyed))
        }
        destroyed.push(block)
      }

      const reason = await runVoidAction(
        readSectionError,
        () => facade.deleteSection(pageId, target.id),
        () => !facade.sections().some(s => s.id === target.id),
        `${DECLINED} did not delete the section`,
      )
      if (reason !== null) {
        // The blocks are gone and the section is not: the worst state this op
        // can reach, and the one an error-ref guess would have called success.
        // History is deliberately left intact — it is the only remaining route
        // back to those blocks.
        return fail(opId, withLoss(reason, destroyed))
      }
      // Restoring a pre-delete snapshot would re-insert blocks carrying a dead
      // sectionId and orphan them [R10].
      facade.clearBlockHistory()
      return { status: 'applied', opId, summary: `Deleted section "${section.name}"` }
    }

    case 'reorder_sections': {
      const current = facade.sections().map(s => s.id)
      const permutation = resolvePermutation(op.order, current, facade, 'section', refs, opId, 'section of the page')
      if (isOutcome(permutation)) return permutation
      const reason = await runVoidAction(
        readSectionError,
        () => facade.reorderSections(pageId, permutation.ids),
        () => arrayEquals(orderedSectionIds(facade), permutation.ids),
        `${DECLINED} did not reorder the sections`,
      )
      return reason !== null
        ? fail(opId, reason)
        : { status: 'applied', opId, summary: 'Reordered sections' }
    }

    case 'update_layout_config': {
      const target = resolve(op.target, facade, 'section', refs, opId)
      if (isOutcome(target)) return target
      const section = facade.sections().find(s => s.id === target.id)
      if (!section) return fail(opId, 'target no longer exists')
      if (!section.sectionType) {
        return fail(opId, 'this section carries no section type, so it declares no layout settings')
      }
      // Registry, not a restated allowlist (D8): which layoutConfig ids exist
      // and which values each accepts are the section type's OWN schema, per
      // type. A local list here would be the fourth parallel description of the
      // surface — the exact defect v2 exists to remove.
      const registry = facade.editableSurface()
      if (!registry) {
        return fail(opId, 'the host cannot read this theme\'s editable surface, so it cannot confirm these are layout settings this section declares')
      }
      const context: ValidationContext = { registry, principal: 'agent' }
      const issues: ValidationIssue[] = []
      for (const [key, value] of Object.entries(op.values)) {
        const address: EditableAddress = {
          entity: 'section',
          scope: { sectionType: section.sectionType },
          path: `layoutConfig.${key}`,
        }
        issues.push(...validate(address, value, context))
      }
      const refusal = firstError(issues)
      if (refusal) return fail(opId, refusal)

      // MERGED over the section's current layoutConfig: the endpoint replaces
      // the column it is given, so sending only the keys the model named would
      // silently clear every other layout setting the section holds — the same
      // hazard `update_block_settings` merges around.
      const merged = { ...section.layoutConfig, ...op.values }
      const updated = await runValueAction(
        readSectionError,
        () => facade.updateSection(pageId, target.id, { layoutConfig: merged }),
        `${DECLINED} did not update the section layout — retry`,
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : {
            status: 'applied', opId, producedId: target.id,
            summary: `Set section layout ${Object.keys(op.values).join(', ')}`,
          }
    }

    case 'duplicate_section': {
      const target = resolve(op.target, facade, 'section', refs, opId)
      if (isOutcome(target)) return target
      // editorStore.duplicateSection records into editorStore's own error ref.
      const copy = await runValueAction(
        () => facade.readEditorError(),
        () => facade.duplicateSection(pageId, target.id),
        `${DECLINED} did not duplicate the section — retry`,
      )
      return isRejection(copy)
        ? fail(opId, copy.reason)
        : { status: 'applied', opId, summary: 'Duplicated section', producedId: copy.value.id }
    }

    default: {
      // Exhaustiveness guard: a new section-family op kind must be handled here
      // rather than silently reported as applied.
      const exhaustive: never = op
      return fail(opId, `unhandled section op: ${JSON.stringify(exhaustive)}`)
    }
  }
}

async function applyBlockOp(
  op: BlockOp, opId: string, facade: EditorOpsFacade, refs: ReadonlyMap<string, string>,
  batchPageId: string | undefined,
): Promise<OpOutcome> {
  // The block store actions read `currentPage` themselves rather than taking a
  // page id, so after a navigation they operate on the new page's array. Target
  // resolution catches most of that (the live graph stops resolving the old
  // ids), but a label or selection ref can resolve on the WRONG page — so gate
  // the family rather than relying on resolution to fail.
  const anchor = pageAnchorFailure(opId, facade, batchPageId)
  if (anchor) return anchor
  const readEditorError = () => facade.readEditorError()

  switch (op.kind) {
    case 'add_block': {
      // Two gates: the type must exist in this theme, and it must still be an
      // authoring target — a deprecated schema renders from snapshots but the
      // create endpoint refuses it, so an op would otherwise "succeed" into a
      // block the add-menu itself cannot make.
      if (!facade.knownBlockTypes().includes(op.blockType)) {
        return fail(opId, `unknown block type "${op.blockType}"`)
      }
      if (!facade.insertableBlockTypes().includes(op.blockType)) {
        return fail(opId, `block type "${op.blockType}" is deprecated and can no longer be created`)
      }
      if (op.layoutRole && !facade.knownLayoutRoles().includes(op.layoutRole)) {
        return fail(opId, `unknown layout role "${op.layoutRole}"`)
      }
      // Schema-judged settings: invented keys and option-incompatible values
      // are refused here instead of persisting and rendering as nothing (the
      // single biggest "the assistant added random stuff" vector). Fail-open
      // when no schema is loaded — same posture as the key gate below.
      const addFields = facade.blockSettingFields(op.blockType)
      if (op.settings && addFields) {
        const issues = validateSettingValues(addFields, op.settings, { checkUnknownKeys: true })
        if (issues.length > 0) {
          return fail(opId, `invalid settings for ${op.blockType}: ${issues[0]!.message}`)
        }
      }
      let sectionId: string | undefined
      if (op.section) {
        const target = resolve(op.section, facade, 'section', refs, opId)
        if (isOutcome(target)) return target
        sectionId = target.id
      }
      else {
        // The section the author is looking at, matching where a click would
        // land the block. Undefined leaves it unsectioned, as the store does.
        sectionId = facade.selection().sectionId ?? facade.selection().activeSectionId ?? undefined
      }

      // `addBlock`'s `position` is a SPLICE INDEX into the page's one flat
      // block array (`blocks.value.splice(position, 0, …)`), NOT a block's
      // `position` field. The two agree only while the array is contiguously
      // numbered, and `removeBlockFromState` filters WITHOUT renumbering — so
      // after any delete earlier in the same batch, a member's `position` runs
      // ahead of its array index and using it would splice the block too far
      // right, past the end of its own section. Derive the index from array
      // order and the mismatch cannot arise.
      //
      // Past the last member the block lands directly AFTER it rather than at
      // the page's end: appending globally would jump the block over every
      // later section while still claiming membership in this one.
      let position: number | null = null
      if (op.indexInSection !== undefined && sectionId) {
        const order = orderedBlocks(facade)
        const members = order.filter(b => b.sectionId === sectionId)
        const anchor = members[op.indexInSection]
        const last = members[members.length - 1]
        position = anchor
          ? order.findIndex(b => b.id === anchor.id)
          : last
            ? order.findIndex(b => b.id === last.id) + 1
            : null
      }
      const created = await runValueAction(
        readEditorError,
        () => facade.addBlock(op.blockType, position, op.settings, sectionId, op.layoutRole),
        `${DECLINED} did not add the block — retry`,
      )
      // createBlock already selects the new block, so no follow-up select.
      return isRejection(created)
        ? fail(opId, created.reason)
        : { status: 'applied', opId, summary: `Added a ${op.blockType} block`, producedId: created.value.id }
    }

    case 'update_block_settings': {
      const target = resolve(op.target, facade, 'block', refs, opId)
      if (isOutcome(target)) return target
      // Flush BEFORE reading the merge base, not just before writing: an
      // unflushed inspector job means the local settings are an optimistic
      // draft no row holds, and merging the patch over that would persist the
      // draft as though the author had saved it.
      if (!await facade.flushBlockJob(target.id)) {
        return fail(opId, 'the block has unsaved edits in the inspector that could not be saved first')
      }
      const block = facade.blocks().find(b => b.id === target.id)
      if (!block) return fail(opId, 'target no longer exists')
      // Reject keys the schema does not declare BEFORE merging: the endpoint
      // accepts any shape, so an invented key persists, reports applied, and
      // renders nothing. Null declared ids (no schema loaded) fail open.
      const declaredKeys = facade.blockSettingIds(block.type)
      if (declaredKeys) {
        const unknownKeys = Object.keys(op.patch).filter(key => !declaredKeys.includes(key))
        if (unknownKeys.length) {
          return fail(
            opId,
            `unknown setting(s) for ${block.type}: ${unknownKeys.join(', ')} — declared: ${declaredKeys.join(', ')}`,
          )
        }
      }
      // Value gate, same lane as the key gate: keys the schema declares can
      // still carry values it forbids (an option-list miss, a non-boolean
      // toggle, a child type the container rejects). Fail-open without a
      // schema, like everything else in this block.
      const patchFields = facade.blockSettingFields(block.type)
      if (patchFields) {
        const issues = validateSettingValues(patchFields, op.patch)
        if (issues.length > 0) {
          return fail(opId, `invalid value(s) for ${block.type}: ${issues[0]!.message}`)
        }
      }
      // The endpoint replaces the settings object it is given, so the patch has
      // to be merged over the block's CURRENT settings — sending the patch
      // alone would drop every key the model did not mention.
      const updated = await runThrowingAction(
        () => facade.updateBlock(target.id, { ...block.settings, ...op.patch }),
        `${DECLINED} did not update the block — retry`,
        'block update failed',
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : { status: 'applied', opId, summary: 'Updated block settings', producedId: target.id }
    }

    case 'set_block_field': {
      const target = resolve(op.target, facade, 'block', refs, opId)
      if (isOutcome(target)) return target
      // Root-segment check, same rationale as update_block_settings: the model
      // wrote `options.heading` on a block whose declared field is `heading`
      // and the deep-set "succeeded" into a path nothing reads. Only the first
      // segment is checkable — nesting below a declared id is field-shaped.
      const fieldBlock = facade.blocks().find(b => b.id === target.id)
      if (!fieldBlock) return fail(opId, 'target no longer exists')
      const declaredIds = facade.blockSettingIds(fieldBlock.type)
      const rootKey = rootSegment(op.fieldPath)
      if (declaredIds && rootKey && !declaredIds.includes(rootKey)) {
        return fail(
          opId,
          `"${rootKey}" is not a setting of ${fieldBlock.type} — declared: ${declaredIds.join(', ')}`,
        )
      }
      // Value gate for whole-field writes only: `heading: "banana"` into a
      // select is refused here, while a deep path (`cards[2].title`) stays the
      // server's business — the op writes INTO the field, not the field itself.
      if (declaredIds && rootKey && op.fieldPath === rootKey) {
        const rootFields = facade.blockSettingFields(fieldBlock.type)
        if (rootFields) {
          const issues = validateSettingValues(rootFields, { [rootKey]: op.value })
          if (issues.length > 0) {
            return fail(opId, `invalid value for ${fieldBlock.type}.${rootKey}: ${issues[0]!.message}`)
          }
        }
      }
      // Same lane problem as update_block_settings: the field write serialises
      // on its own key, so a pending inspector job would flush over it later.
      if (!await facade.flushBlockJob(target.id)) {
        return fail(opId, 'the block has unsaved edits in the inspector that could not be saved first')
      }
      // Deliberately NOT updateBlock: its reconcileBlockResponse patches only
      // keys present in the request, and a {fieldPath, value} request has no
      // settings keys, so local state would silently drift from the server [R3].
      //
      // updateBlockField throws — on a rejected write AND synchronously on an
      // undefined value. Unhandled, either one unwinds the whole batch loop and
      // the ops after this one never run.
      const updated = await runThrowingAction(
        () => facade.updateBlockField(target.id, op.fieldPath, op.value),
        `${DECLINED} did not write the field — retry`,
        'block field update failed',
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : { status: 'applied', opId, summary: `Set ${op.fieldPath}`, producedId: target.id }
    }

    case 'attach_media': {
      const target = resolve(op.target, facade, 'block', refs, opId)
      if (isOutcome(target)) return target
      const block = facade.blocks().find(b => b.id === target.id)
      if (!block) return fail(opId, 'target no longer exists')

      const rootKey = rootSegment(op.fieldPath)
      if (!rootKey) return fail(opId, `"${op.fieldPath}" does not name a setting`)
      // Fail CLOSED where `set_block_field` fails open. That op's contract is
      // "write this value wherever I say"; this one's is "this destination is a
      // media field of this block", and a host that cannot read the schema
      // cannot make that claim. The reason names the op that does not need it,
      // so an unreadable schema costs the validation rather than the write.
      const field = facade.blockSettingField(block.type, rootKey)
      if (!field) {
        return fail(
          opId,
          `the host cannot see a "${rootKey}" setting on ${block.type}, so it cannot confirm it takes media — use set_block_field if the path is right`,
        )
      }
      if (!MEDIA_FIELD_TYPES.has(field.type)) {
        return fail(opId, `"${rootKey}" is a ${field.type} field on ${block.type}, not a media field`)
      }
      // A gallery holds a LIST. Writing one reference at its root replaces
      // every image in it with a bare string the renderer cannot iterate, so
      // the root is refused and an indexed path into it is not.
      if (GALLERY_FIELD_TYPES.has(field.type) && rootKey === op.fieldPath) {
        return fail(
          opId,
          `"${rootKey}" is a gallery and holds a list — attach to one slot (e.g. ${rootKey}[0]) rather than the whole field`,
        )
      }

      const media = await facade.lookupMedia(op.mediaId)
      if (!media) {
        return fail(opId, `"${op.mediaId}" is not in this site's media library — pick an id from the library listed in your context`)
      }
      // Which SHAPE the field stores. `TImagePicker` reads the same
      // `options.valueMode` and defaults to 'url' for block authoring, so a
      // field that declares nothing gets the value the picker would have
      // written. `op.mode` overrides both, for a field whose schema is silent
      // but whose stored shape the operator knows.
      const mode = op.mode ?? (field.valueMode === 'id' ? 'id' : 'url')
      const value = mode === 'id' ? media.id : media.url

      // Same lane problem as set_block_field: the field write serialises on its
      // own key, so a pending inspector job would flush over it later.
      if (!await facade.flushBlockJob(target.id)) {
        return fail(opId, 'the block has unsaved edits in the inspector that could not be saved first')
      }
      const updated = await runThrowingAction(
        () => facade.updateBlockField(target.id, op.fieldPath, value),
        `${DECLINED} did not write the field — retry`,
        'block field update failed',
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : {
            status: 'applied', opId, producedId: target.id,
            summary: `Attached ${media.filename} to ${op.fieldPath}`,
          }
    }

    case 'set_block_placement': {
      const target = resolve(op.target, facade, 'block', refs, opId)
      if (isOutcome(target)) return target
      const block = facade.blocks().find(b => b.id === target.id)
      if (!block) return fail(opId, 'target no longer exists')
      const registry = facade.editableSurface()
      if (!registry) {
        return fail(opId, 'the host cannot read this theme\'s editable surface, so it cannot confirm free placement is legal here')
      }

      // The geometry that will actually be STORED is what gets validated: the
      // op carries a partial, merged over the block's current canvas so a model
      // that moves a block does not also erase its size.
      const current = facade.blockPlacement(target.id)
      const canvas = { ...current.canvas, ...op.canvas }

      // TWO routes to legal geometry — a section type with a layered slot, or a
      // brand-canvas page, which is free placement end to end — and the registry
      // entry now models both as an any-of condition, so the kernel agrees with
      // this predicate instead of being stricter than it. The predicate is still
      // asked FIRST, and only for the message: `not-writable` states the verdict
      // and none of the recovery, and geometry has exactly two preconditions
      // worth naming to a model that just had a move refused.
      const section = block.sectionId
        ? facade.sections().find(s => s.id === block.sectionId)
        : undefined
      const layered = facade.layeredSectionTypes()
      const pageType = facade.pageType()
      if (!canvasGeometryAllowed(pageType, section?.sectionType, layered)) {
        // The kernel's own wording for a refused capability is "…is never;
        // agent may not write it", which states the verdict and none of the
        // recovery. Geometry has exactly two preconditions, so name them.
        const legal = [...layered].sort().join(', ')
        return fail(opId, legal
          ? `free placement needs a brand-canvas page or a section type with a layered slot (${legal}); this block is in ${section?.sectionType ?? 'no section'}`
          : 'free placement needs a brand-canvas page, and no section type in this theme offers it either, so canvas geometry cannot be set here')
      }

      const issues = validate(
        { entity: 'block', scope: { blockType: block.type }, path: 'placement.canvas' },
        canvas,
        {
          registry,
          principal: 'agent',
          layeredSectionTypes: layered,
          ...(section?.sectionType ? { sectionType: section.sectionType } : {}),
          // The brand-canvas route of the entry's condition. Passed as `null`
          // rather than omitted when the page carries no type: omitting it means
          // "not looked at", which leaves the route unevaluable and drops the
          // entry back to its `never` base.
          pageType: pageType ?? null,
        },
      )
      const refusal = firstError(issues)
      if (refusal) return fail(opId, refusal)

      facade.updateBlockPlacement(target.id, { ...current, canvas })
      // Post-condition on the LOCAL commit, which is what the preview renders
      // and what the queued save serialises. `updateBlockPlacement` no-ops on an
      // identical placement, so a geometry that was already set reads as applied
      // — the page ends in the requested state either way.
      const landed = facade.blockPlacement(target.id).canvas
      if (JSON.stringify(landed) !== JSON.stringify(canvas)) {
        return fail(opId, 'the editor did not accept the placement — open the block in the editor and check its section')
      }
      return {
        status: 'applied', opId, producedId: target.id,
        summary: `Placed the block on the section canvas`,
      }
    }

    case 'delete_block': {
      const target = resolve(op.target, facade, 'block', refs, opId)
      if (isOutcome(target)) return target
      // The boolean is not the post-condition: deleteBlock returns false from
      // four silent guards, and the state that decides the op is the block's
      // absence from the live page.
      //
      // Caveat on every ABSENCE post-condition here: a mid-flight navigation
      // empties the live page graph, so "the block is gone" also holds when the
      // operator simply left. Nothing readable from this op can tell the two
      // apart — the fix is the driver re-checking the batch page anchor before
      // each op (Task 9), not a cleverer test here.
      const reason = await runVoidAction(
        readEditorError,
        async () => { await facade.deleteBlock(target.id) },
        () => !facade.blocks().some(b => b.id === target.id),
        `${DECLINED} did not delete the block`,
      )
      return reason !== null
        ? fail(opId, reason)
        : { status: 'applied', opId, summary: 'Deleted a block' }
    }

    case 'reorder_blocks': {
      const section = resolve(op.section, facade, 'section', refs, opId)
      if (isOutcome(section)) return section
      const members = sectionBlocks(facade, section.id)
      const permutation = resolvePermutation(
        op.order, members.map(b => b.id), facade, 'block', refs, opId, 'block of the section',
      )
      if (isOutcome(permutation)) return permutation

      // Splice the section-local order back into the page-global array: the
      // slots this section owns receive the new ids and everything else is
      // untouched, because reorderBlocks writes the WHOLE page order and
      // blocks/replace-all persists exactly what it is handed.
      const global = orderedBlocks(facade).map(b => b.id)
      const memberIds = new Set(members.map(b => b.id))
      const next = [...global]
      let slot = 0
      global.forEach((id, index) => {
        if (memberIds.has(id)) next[index] = permutation.ids[slot++]!
      })

      // Known gap, shared with every "requested state" post-condition here: if
      // the blocks are ALREADY in the requested order, the check passes whether
      // or not the PUT succeeded, so a failed reorder-to-current-order reads as
      // applied. Harmless in effect — the page ends up in the state that was
      // asked for either way — but it is not proof the write landed.
      const reason = await runVoidAction(
        readEditorError,
        () => facade.reorderBlocks(next),
        () => arrayEquals(orderedBlocks(facade).map(b => b.id), next),
        `${DECLINED} did not reorder the blocks`,
      )
      return reason !== null
        ? fail(opId, reason)
        : { status: 'applied', opId, summary: 'Reordered blocks' }
    }

    case 'move_block': {
      const target = resolve(op.target, facade, 'block', refs, opId)
      if (isOutcome(target)) return target
      const toSection = resolve(op.toSection, facade, 'section', refs, opId)
      if (isOutcome(toSection)) return toSection
      if (op.layoutRole && !facade.knownLayoutRoles().includes(op.layoutRole)) {
        return fail(opId, `unknown layout role "${op.layoutRole}"`)
      }
      // The destination index the store will actually use: it clamps against
      // the members MINUS the moving block, so the post-condition has to be
      // computed the same way or an append would never match.
      const destination = sectionBlocks(facade, toSection.id).filter(b => b.id !== target.id)
      const index = Math.max(0, Math.min(op.indexInSection ?? destination.length, destination.length))
      // The role too, not just the slot: `moveBlockToSection` writes sectionId,
      // position AND layoutRole in one array rewrite, so a post-condition that
      // only checks the slot passes while the role silently did not change.
      const landed = () => {
        const members = sectionBlocks(facade, toSection.id)
        if (members.findIndex(b => b.id === target.id) !== index) return false
        if (op.layoutRole === undefined) return true
        return members.find(b => b.id === target.id)?.layoutRole === op.layoutRole
      }
      // A move to where the block already is would satisfy that post-condition
      // without the store doing anything, and a silent decline would then read
      // as applied. Settle it before the call instead of guessing after it.
      if (landed()) {
        return { status: 'applied', opId, summary: 'The block was already where the move asked for', producedId: target.id }
      }
      // The move serialises the WHOLE live array to blocks/replace-all, and
      // optimistic inspector drafts live in that array — so without this the
      // move persists any block's unsaved draft as though it had been saved,
      // including blocks this op never named. Same class as the per-block flush
      // above, one op wider: here the blast radius is the page.
      if (!await facade.flushPageBlockJobs()) {
        return fail(opId, 'the page has unsaved edits in the inspector that could not be saved first')
      }
      // moveBlockToSection returns false with no reason from every guard AND
      // from its own bare catch, so nothing is ever recorded for the error ref
      // to find. Its failures are not the retryable contention the other
      // declines describe — a second identical attempt fails identically.
      const reason = await runVoidAction(
        readEditorError,
        async () => { await facade.moveBlockToSection(target.id, toSection.id, index, op.layoutRole) },
        landed,
        'the editor did not move the block, and reports no reason — check the destination section in the editor',
      )
      return reason !== null
        ? fail(opId, reason)
        : { status: 'applied', opId, summary: 'Moved a block between sections', producedId: target.id }
    }

    default: {
      const exhaustive: never = op
      return fail(opId, `unhandled block op: ${JSON.stringify(exhaustive)}`)
    }
  }
}

async function applySettingsOp(
  op: SettingsOp, opId: string, facade: EditorOpsFacade, batchPageId: string | undefined,
): Promise<OpOutcome> {
  switch (op.kind) {
    case 'update_page_settings': {
      const anchor = pageAnchorFailure(opId, facade, batchPageId)
      if (anchor) return anchor
      const updated = await runThrowingAction(
        () => facade.updatePageDetails(facade.pageId(), op.patch),
        `${DECLINED} did not update the page — retry`,
        'page settings update failed',
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : { status: 'applied', opId, summary: 'Updated page settings' }
    }

    case 'update_theme_settings': {
      const anchor = siteGlobalAnchorFailure(opId, facade, batchPageId)
      if (anchor) return anchor
      const updated = await runThrowingAction(
        () => facade.updateThemeSettings(op.patch),
        `${DECLINED} did not update the theme — retry`,
        'theme settings update failed',
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : { status: 'applied', opId, summary: 'Updated theme settings' }
    }

    case 'update_layout_settings': {
      const anchor = siteGlobalAnchorFailure(opId, facade, batchPageId)
      if (anchor) return anchor
      const updated = await runThrowingAction(
        () => facade.updateLayoutSettings(op.layoutType, op.patch),
        `${DECLINED} did not update the ${op.layoutType} — retry`,
        `${op.layoutType} settings update failed`,
      )
      return isRejection(updated)
        ? fail(opId, updated.reason)
        : { status: 'applied', opId, summary: `Updated ${op.layoutType} settings` }
    }

    case 'update_typography_preset': {
      const anchor = siteGlobalAnchorFailure(opId, facade, batchPageId)
      if (anchor) return anchor
      // Hydrate BEFORE resolving the label. `useTypographyAdmin` is a plain
      // composable with per-call refs, not a store, so a facade holding its own
      // instance starts with an EMPTY preset list and every label would fail as
      // "no unique preset" — a wrong answer that reads like a real one.
      if (!await facade.refreshTypography()) {
        return fail(opId, 'typography could not be loaded from the server — try again')
      }
      const preset = resolveByLabel(facade.typographyPresets(), op.presetLabel, p => p.name)
      if (!preset) return fail(opId, `no unique typography preset named "${op.presetLabel}"`)
      try {
        // The typography composable has no guard-return path at all: it either
        // completes the PUT or throws, so the absence of a throw IS the
        // post-condition here — there is no silent decline to mistake for one.
        await facade.updateTypographyPreset(preset.id, op.patch)
        // Typography writes live in a composable, not a store; the refetch is
        // what makes the preview recompute against the new preset. The write
        // has already landed by here, so a failed refetch is a stale preview —
        // a warning, never a failure that would invite a duplicate write.
        const refreshed = await facade.refreshTypography()
        return {
          status: 'applied', opId, summary: `Updated typography preset "${preset.name}"`,
          ...(refreshed ? {} : { warnings: ['the preset was saved but typography could not be reloaded, so the preview may be stale'] }),
        }
      }
      catch (err) {
        return fail(opId, err instanceof Error ? err.message : 'typography preset update failed')
      }
    }

    case 'set_typography_roles': {
      const anchor = siteGlobalAnchorFailure(opId, facade, batchPageId)
      if (anchor) return anchor
      // DATA-LOSS GUARD (preflight S3). saveRoles PUTs the COMPLETE map and the
      // server replaces all mappings, so merging into a map that was never
      // loaded would clear every typography role on the site.
      //
      // The map itself cannot tell us whether that happened: the composable
      // enumerates every system role with `null` for the unmapped ones, so an
      // unloaded site and a site with nothing assigned yet look identical — and
      // "at least one non-null role" would be the wrong test anyway, since it
      // would block the first assignment on a fresh site. The signal has to be
      // the LOAD's own verdict, refreshed FIRST so the merge base is the
      // server's rather than a stale local copy. The same refresh is what
      // hydrates the PRESET list the role labels below resolve against — on a
      // freshly constructed facade that list starts empty.
      if (!await facade.refreshTypography()) {
        return fail(opId, 'typography could not be loaded from the server, and roles are not merged into an unverified map — try again')
      }
      const current = facade.typographyRoleMap()
      // Belt, not a second strand: against the real composable an empty map is
      // unreachable, so this catches a facade wired wrong, nothing else.
      if (!facade.typographyRolesLoaded() || Object.keys(current).length === 0) {
        return fail(opId, 'typography roles are not loaded yet — open Typography once, then ask again')
      }
      // Merge over the loaded map: sending only the roles the model mentioned
      // would silently clear the rest [R5]. Labels resolve to preset ids here,
      // and every rejection happens BEFORE the single write.
      const merged: Record<string, string | null> = { ...current }
      for (const [role, label] of Object.entries(op.roles)) {
        if (!(role in current)) return fail(opId, `unknown typography role "${role}"`)
        if (label === null) {
          merged[role] = null
          continue
        }
        const preset = resolveByLabel(facade.typographyPresets(), label, p => p.name)
        if (!preset) return fail(opId, `no unique typography preset named "${label}"`)
        merged[role] = preset.id
      }
      try {
        await facade.saveTypographyRoles(merged)
        // Already persisted; a failed reload is a stale preview, not a failure.
        const refreshed = await facade.refreshTypography()
        return {
          status: 'applied', opId, summary: 'Updated typography roles',
          ...(refreshed ? {} : { warnings: ['the roles were saved but typography could not be reloaded, so the preview may be stale'] }),
        }
      }
      catch (err) {
        return fail(opId, err instanceof Error ? err.message : 'typography role save failed')
      }
    }

    default: {
      const exhaustive: never = op
      return fail(opId, `unhandled settings op: ${JSON.stringify(exhaustive)}`)
    }
  }
}

async function applySelectOp(
  op: SelectOp, opId: string, facade: EditorOpsFacade, refs: ReadonlyMap<string, string>,
): Promise<OpOutcome> {
  // A select target may be either kind; try block first, then section, and keep
  // the section attempt's reason when both miss — for the common `{ by: 'id' }`
  // both report the same "no longer exists", and for a label the section
  // vocabulary is the one an operator recognises.
  const asBlock = resolveTarget(op.target, targetContext(facade, 'block', refs))
  if (asBlock.ok) {
    return await facade.selectBlock(asBlock.id)
      ? { status: 'applied', opId, summary: 'Selected a block', producedId: asBlock.id }
      : fail(opId, 'the inspector has unsaved work and refused to change selection')
  }
  const asSection = resolveTarget(op.target, targetContext(facade, 'section', refs))
  if (asSection.ok) {
    return await facade.selectSection(asSection.id)
      ? { status: 'applied', opId, summary: 'Selected a section', producedId: asSection.id }
      : fail(opId, 'the inspector has unsaved work and refused to change selection')
  }
  return fail(opId, asSection.reason)
}

/**
 * `batchPageId` is the page the batch was composed against. It is optional in
 * the signature only so page-scoped callers stay unchanged; every SITE-GLOBAL op
 * REFUSES to run without it (see `siteGlobalAnchorFailure`), so a driver that
 * omits it loses those ops loudly rather than applying them to the wrong site.
 */
export async function applyEditorOp(
  op: SplashEditorOp, opId: string, facade: EditorOpsFacade, refs: ReadonlyMap<string, string>,
  batchPageId?: string,
): Promise<OpOutcome> {
  switch (op.kind) {
    // Grouped labels narrow `op` to each family without an assertion.
    case 'add_section':
    case 'update_section':
    case 'change_section_type':
    case 'delete_section':
    case 'reorder_sections':
    case 'duplicate_section':
    case 'update_layout_config':
      return applySectionOp(op, opId, facade, refs, batchPageId)

    case 'add_block':
    case 'update_block_settings':
    case 'set_block_field':
    case 'delete_block':
    case 'reorder_blocks':
    case 'move_block':
    case 'attach_media':
    case 'set_block_placement':
      return applyBlockOp(op, opId, facade, refs, batchPageId)

    case 'update_page_settings':
    case 'update_theme_settings':
    case 'update_layout_settings':
    case 'update_typography_preset':
    case 'set_typography_roles':
      return applySettingsOp(op, opId, facade, batchPageId)

    case 'select':
      return applySelectOp(op, opId, facade, refs)

    default: {
      // Every kind is handled above; a new union member fails the BUILD here
      // rather than reaching the operator as a silent no-op.
      const exhaustive: never = op
      return fail(opId, `unsupported op kind: ${JSON.stringify(exhaustive)}`)
    }
  }
}
