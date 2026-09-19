import { applyEditorOp } from '~/admin/utils/editorOps/applyEditorOp'
import type { EditorOpsFacade } from '~/admin/utils/editorOps/facade'
import type { SplashEditorOp, SplashPendingEditorOps } from '~/admin/lib/protocol/types/splash-editor-ops'
import type { SplashEditorOpsReport } from '~/admin/lib/protocol/types/splash-editor-context'

/** Mirrors `SplashEditorOpsReportSchema`; the report is re-parsed at the wire. */
const MAX_REPORT_ENTRY = 200
const MAX_OP_ID = 80
const MAX_WARNINGS = 10
const MAX_ENTRIES = 20

/**
 * Ops after which a Cmd-Z should restore the pre-batch block state. Section,
 * theme, layout and typography changes are NOT undoable — that is today's
 * editor behaviour, stated rather than implied [R10].
 *
 * The membership rule is the address class (D8): only `block`-class writes are
 * undoable, because the history mechanism is a snapshot of the block array and
 * captures nothing else. `set_block_placement` qualifies — placement lives on
 * the block and rides in that snapshot — while `update_layout_config` writes a
 * section column the snapshot never held, so it is a history boundary like
 * every other section op.
 */
export const BLOCK_HISTORY_KINDS: ReadonlySet<string> = new Set([
  'add_block', 'update_block_settings', 'set_block_field',
  'delete_block', 'reorder_blocks', 'move_block', 'attach_media',
  'set_block_placement',
])

/**
 * Kinds whose verdict is read back from the LIVE PAGE GRAPH rather than
 * returned by the writer. These are the only ones a mid-flight navigation can
 * falsify: an ABSENCE post-condition (`delete_block`, the `delete_section`
 * cascade) passes trivially once the graph has emptied, and an order comparison
 * against the new page is meaningless.
 *
 * Everything else — the create/update/duplicate/type-change writers via
 * `runValueAction` / `runThrowingAction`, the settings writers, and the
 * selection booleans — reports its own verdict, which a later navigation cannot
 * retroactively invalidate. Downgrading those would be worse than useless: it
 * discards `producedId`, so the op's `ref` never binds and the model's natural
 * retry DUPLICATES the entity — exactly the hazard applyEditorOp guards against
 * when it reports the id even on a partly-failed create.
 *
 * This is not a second anchor gate on the site-global ops: they already refuse
 * to run without the batch anchor (`siteGlobalAnchorFailure`), and that gate is
 * the PRE-call half. This set is only about which verdicts survive the
 * IN-FLIGHT half.
 */
const LIVE_GRAPH_VERDICT_KINDS: ReadonlySet<string> = new Set([
  'delete_section', 'reorder_sections', 'delete_block', 'reorder_blocks', 'move_block',
])

function truncate(value: string, limit = MAX_REPORT_ENTRY): string {
  return value.length > limit ? value.slice(0, limit) : value
}

function plural(count: number): string {
  return count === 1 ? 'op was' : 'ops were'
}

/** What an op's success does to the block undo history, and to content. */
interface HistoryClearEffect {
  /** The op's own action, phrased for the operator. */
  what: string
  /**
   * Whether CONTENT is gone, not merely the undo stack. Only a confirmed
   * `delete_section` destroys: the other three add or transform, and their clear
   * is a precaution about what a restored snapshot would mean. The distinction
   * ranks the report — a lost undo stack is recoverable by redoing the work,
   * deleted blocks are not.
   */
  destroysContent: boolean
}

/**
 * THE source of truth for "does this op wipe the block undo history", replacing
 * three parallel encodings of the same question that could disagree.
 *
 * `clearBlockHistory` is NOT gated by suppression (blockStore.ts:128), so it
 * fires mid-batch and empties the stack. `delete_section` is the visible case —
 * the executor calls the clear itself — but three more clear from inside the
 * stores, and two of the four clear on only one branch:
 *
 * - `change_section_type` — sectionStore.ts:345, on every applied transition.
 * - `duplicate_section` — editorStore.ts:1619, always on success.
 * - `add_section` WITH blocks — editorStore.ts:1685, `createSectionFromPreset`.
 *
 * The non-clearing kinds are listed rather than caught by `default`, so the
 * `never` below fails the BUILD when a kind is added to the union. A `default`
 * would hand a new clearing kind either silence or, worse, another kind's
 * description.
 */
function historyClearEffect(
  op: SplashEditorOp, sectionRowConfirmed: boolean,
): HistoryClearEffect | null {
  switch (op.kind) {
    // Phase 1 returns before the store is touched, so only a confirmed delete
    // reaches the clear.
    case 'delete_section':
      if (!op.confirm) return null
      return {
        // `sectionRowConfirmed: false` is the mid-flight-navigation path. The
        // member cascade and the clear both completed before the navigation
        // could matter — only the section row's own post-condition was read
        // against the wrong page — so the destruction is stated as fact.
        what: sectionRowConfirmed
          ? 'deleted a section and its blocks permanently'
          : "destroyed a section's blocks permanently (the section row itself is unconfirmed)",
        destroysContent: true,
      }
    // Only the preset path clears, and `applyEditorOp` takes it exactly when the
    // op carries blocks. A plain create leaves history alone.
    case 'add_section':
      return (op.blocks?.length ?? 0) > 0
        ? { what: 'added a section with blocks', destroysContent: false }
        : null
    case 'change_section_type':
      return { what: 'changed a section type', destroysContent: false }
    case 'duplicate_section':
      return { what: 'duplicated a section', destroysContent: false }

    case 'update_section':
    case 'reorder_sections':
    case 'update_layout_config':
    case 'set_block_placement':
    case 'add_block':
    case 'update_block_settings':
    case 'set_block_field':
    case 'attach_media':
    case 'delete_block':
    case 'reorder_blocks':
    case 'move_block':
    case 'update_page_settings':
    case 'update_theme_settings':
    case 'update_layout_settings':
    case 'update_typography_preset':
    case 'set_typography_roles':
    case 'select':
      return null

    default: {
      const exhaustive: never = op
      return exhaustive
    }
  }
}

/**
 * Apply one batch in order, fail-soft per op (spec §4.1).
 *
 * NOT transactional: individual store actions are transactional server-side
 * where it matters (sections/with-blocks, sections/:id/type, blocks/replace-all)
 * but there is no cross-action rollback, and inventing one would mean a second
 * write path. The executor stops at the first failure — later ops usually depend
 * on it — and reports applied / failed / skipped.
 *
 * Everything it reads comes from the LIVE facade, per op. Nothing about the
 * store is cached across ops: an entity an earlier op created has to be a
 * candidate for a later op's target, one a later op deleted has to stop
 * resolving, and the membership + scope checks in `resolveTarget` mean nothing
 * against a snapshot taken before the batch ran.
 *
 * ⚠️ NOT RE-ENTRANT — the caller must serialise batches. `_historySuppressed` is
 * a store-global flag (blockStore.ts:146), and `withHistorySuppressed` restores
 * the previous value rather than clearing, so two overlapping batches NEST: the
 * inner one's `pushBlockHistory` returns false, its ops become unundoable, and
 * the outer one's snapshot is the only entry either of them gets. The batch also
 * runs on the batch page anchor, which a second concurrent batch could move. Do
 * not call this again until the returned promise settles.
 */
export async function applyEditorOpBatch(
  pending: SplashPendingEditorOps,
  facade: EditorOpsFacade,
): Promise<SplashEditorOpsReport> {
  const applied: string[] = []
  const failed: { opId: string, reason: string }[] = []
  /**
   * Three lists, one cap, emitted in this order so the slice can only ever drop
   * the most recoverable material:
   *
   * 1. `destructive` — content is permanently gone. Nothing else in the system
   *    still knows it existed.
   * 2. the deduped generic history-clear notice (see `genericClears`).
   * 3. `critical` — undo lost, a confirmation pending, a snapshot never taken.
   * 4. `warnings` — per-op chatter and skip counts.
   *
   * A single `critical` list was not enough: it is itself capped, and a batch of
   * ten history-clearing ops before one destructive op filled it and evicted the
   * only statement that content was destroyed.
   */
  const destructive: string[] = []
  const critical: string[] = []
  const warnings: string[] = []
  /**
   * OpIds of the ops that cleared history WITHOUT destroying content. Collected
   * rather than pushed: past the first one they all carry identical information
   * — the history is gone — and only the opId prefix made them distinct, so ten
   * of them could evict everything ranked below.
   */
  const genericClears: { opId: string, what: string }[] = []
  /**
   * Batch-local by construction. It is a `const` in this call frame, so it is
   * born empty on every batch and unreachable once the batch returns — a
   * module-level map would let a ref minted against one page resolve against
   * another after a navigation.
   */
  const refs = new Map<string, string>()

  /**
   * Always ends in the index, never truncated away. `batchId` is bounded at 100
   * by the schema and `opId` at 80, so slicing the WHOLE string would cut the
   * index off any batchId ≥ 79 chars and give every op in the batch the same id
   * — an applied/failed list nothing can be attributed to.
   */
  const opIdFor = (suffix: string) =>
    `${truncate(pending.batchId, MAX_OP_ID - suffix.length - 1)}:${suffix}`

  // The batch names the page it was composed against. A mismatch is dropped
  // whole and NEVER auto-switched: navigating the operator somewhere they did
  // not ask to be, to apply writes they have not seen the context for, is the
  // one recovery worse than doing nothing.
  if (facade.pageId() !== pending.pageId) {
    return {
      batchId: pending.batchId,
      applied: [],
      failed: [],
      warnings: [truncate(
        'the editor is on another page than the one these changes were composed against, so none of them were applied — open that page and ask again',
      )],
    }
  }

  // ONE snapshot for the whole batch, taken BEFORE the suppressed region so it
  // captures the pre-batch state. Structural actions (addBlock,
  // moveBlockToSection, reorderBlocks) each push their own entry internally;
  // running the batch inside withHistorySuppressed swallows those, so a mixed
  // batch is still exactly one Cmd-Z (preflight S1).
  //
  // The BOOLEAN decides whether to suppress, not the op kinds. `pushBlockHistory`
  // declines when it is already suppressed or when the serialised block array
  // exceeds 500KB (blockStore.ts:67-80) — and suppressing on top of a declined
  // push swallows every inner push as well, leaving ZERO undo entries where one
  // was promised. Without suppression the structural actions at least record
  // their own, which is worse than one entry and far better than none.
  const wantsSnapshot = pending.ops.some(op => BLOCK_HISTORY_KINDS.has(op.kind))
  const snapshotExists = wantsSnapshot ? facade.pushBlockHistory() : false
  if (wantsSnapshot && !snapshotExists) {
    critical.push(truncate(
      'the editor could not record an undo point for this batch — the page may be too large, or another batch is still running — so Cmd-Z will not restore the state from before it',
    ))
  }

  const noteSkipped = (remaining: number, cause: string) => {
    if (remaining > 0) warnings.push(truncate(`${remaining} later ${plural(remaining)} skipped ${cause}`))
  }

  /**
   * The undo history was wiped mid-batch. Everything in the batch is affected,
   * not just what ran before the clear: suppression is still active afterwards,
   * so the LATER ops' own internal pushes are swallowed too and never become
   * entries of their own.
   *
   * On the critical list because it is the only record that content is
   * unrecoverable, and the general list is routinely full of per-op chatter by
   * the time a late destructive op runs.
   */
  const undoTail = snapshotExists
    ? 'nothing in this batch can be undone, and neither can work from before it.'
    : 'work you did before this batch can no longer be undone.'

  const noteHistoryCleared = (opId: string, effect: HistoryClearEffect) => {
    if (effect.destroysContent) {
      destructive.push(truncate(`${opId} ${effect.what} and cleared the undo history — ${undoTail}`))
      return
    }
    genericClears.push({ opId, what: effect.what })
  }

  /**
   * A destructive op that THREW partway through. `applyEditorOp`'s cascade
   * awaits `facade.deleteBlock` raw, so a throw there lands after N member
   * blocks are already gone — and `withLoss`, which decorates that arm's own
   * `fail()` returns with the loss inventory, never sees a throw. Without this
   * the report says only "socket hang up" about an op that destroyed content.
   *
   * The block labels are not recoverable here: they were known inside the
   * cascade and a throw carries none of them out.
   */
  const noteThrewMidDestruction = (opId: string) => {
    destructive.push(truncate(snapshotExists
      ? `${opId} failed partway through deleting a section — some of its blocks are already deleted. The batch's undo snapshot may still restore them; check before retrying.`
      : `${opId} failed partway through deleting a section — some of its blocks are already deleted permanently, and this batch took no undo snapshot to restore them from.`))
  }

  /**
   * One entry for however many generic clears happened. Naming the first is
   * enough to find the transition in the batch; the rest add no information the
   * count does not already carry.
   */
  const genericClearNotice = (): string[] => {
    const first = genericClears[0]
    if (!first) return []
    return [truncate(genericClears.length === 1
      ? `${first.opId} ${first.what} and cleared the undo history — ${undoTail}`
      : `${genericClears.length} ops cleared the undo history, starting with ${first.opId} which ${first.what} — ${undoTail}`)]
  }

  const runOps = async () => {
    for (const [index, op] of pending.ops.entries()) {
      const opId = opIdFor(String(index))
      const remaining = pending.ops.length - index - 1

      // `applyEditorOp` catches what it calls, but not exhaustively: only the
      // `runThrowingAction` paths have a catch, while `runVoidAction` /
      // `runValueAction`, the inspector flushes, the selection calls and the raw
      // `facade.deleteBlock` awaits in the delete_section cascade do not. An
      // unexpected throw there would reject this promise and take the WHOLE
      // report with it — after a snapshot was pushed, after N ops applied,
      // possibly after blocks were destroyed. The partial report is the only
      // record any of that happened.
      let outcome: Awaited<ReturnType<typeof applyEditorOp>>
      try {
        outcome = await applyEditorOp(op, opId, facade, refs, pending.pageId)
      }
      catch (err) {
        // Disclose the destruction BEFORE the message. A throw inside the
        // delete_section cascade lands after N member blocks are already gone,
        // and the thrown message ("socket hang up") says nothing about that.
        if (historyClearEffect(op, false)?.destroysContent) noteThrewMidDestruction(opId)
        failed.push({ opId, reason: truncate(
          err instanceof Error ? err.message : `the editor threw while applying ${op.kind}`,
        ) })
        noteSkipped(remaining, 'after the failure')
        break
      }

      // The op arms gate on the anchor BEFORE calling the store. This is the
      // other half: the operator can navigate during the await, and by then the
      // op's own post-condition has already been read against whatever page is
      // now open.
      const navigated = facade.pageId() !== pending.pageId
      // A navigation is itself a history event: both `hydratePage`
      // (editorStore.ts:664) and `navigateToChildPage` (:1564) clear the block
      // history, so the batch snapshot is gone whether or not an op cleared it.
      const noteNavigationHistoryLoss = () => {
        if (snapshotExists) {
          critical.push(truncate(
            'the editor moved to another page mid-batch, which clears the undo history — nothing in this batch can be undone',
          ))
        }
      }

      if (outcome.status === 'failed') {
        failed.push({ opId, reason: truncate(outcome.reason) })
        noteSkipped(remaining, 'after the failure')
        break
      }

      if (outcome.status === 'needs-confirm') {
        // Not a failure: the handshake is working as designed. Nothing after it
        // runs, because the operator has not agreed yet.
        critical.push(truncate(outcome.message))
        if (index > 0) {
          // The model's natural recovery is to resend the batch with
          // `confirm: true`, which would RE-APPLY everything that already
          // landed — a batch of [add_block, delete_section] would add the block
          // twice. Say where to resume from, not just that something is pending.
          critical.push(truncate(
            `${opId} is awaiting confirmation and the ${index} ${plural(index)} before it already applied — resend from this op onward, not the whole batch, or they run twice.`,
          ))
        }
        noteSkipped(remaining, 'while the confirmation is pending')
        break
      }

      if (navigated && LIVE_GRAPH_VERDICT_KINDS.has(op.kind)) {
        // Reported applied, but the verdict was read from the page the operator
        // navigated TO. Recording it as applied would tell the model a delete
        // landed when the block may still be sitting on the original page.
        //
        // A confirmed section delete reaching here has ALREADY destroyed every
        // member block and cleared the undo history — the cascade is one await
        // per block, so this is precisely the window the re-check exists for.
        // The destruction notice has to be emitted before the failure entry, or
        // the operator is told only that the host cannot confirm what happened.
        const cleared = historyClearEffect(op, false)
        if (cleared) noteHistoryCleared(opId, cleared)
        else noteNavigationHistoryLoss()
        // `producedId` is carried into the reason: without it a downgraded op
        // that DID create something leaves the model no handle on it, and the
        // retry duplicates the entity.
        const handle = outcome.producedId ? ` (it may have produced "${outcome.producedId}")` : ''
        failed.push({ opId, reason: truncate(
          `the editor moved to another page while this ${op.kind} was in flight, so the host cannot confirm what it did${handle} — check the page the batch was composed against before retrying`,
        ) })
        noteSkipped(remaining, 'after the navigation')
        break
      }

      applied.push(truncate(`${opId} ${outcome.summary}`))
      const cleared = historyClearEffect(op, true)
      if (cleared) noteHistoryCleared(opId, cleared)
      for (const warning of outcome.warnings ?? []) warnings.push(truncate(warning))
      if (op.ref && outcome.producedId) refs.set(op.ref, outcome.producedId)

      if (navigated) {
        // The op itself stands, but every op after it would be applied against a
        // context the model never saw.
        noteNavigationHistoryLoss()
        warnings.push(truncate('the editor moved to another page mid-batch'))
        noteSkipped(remaining, 'after the navigation')
        break
      }
    }
  }

  // Suppress only when a snapshot ACTUALLY exists — see `snapshotExists`.
  try {
    if (snapshotExists) await facade.withHistorySuppressed(runOps)
    else await runOps()
  }
  catch (err) {
    // `runOps` swallows per-op throws, so this can only be the history wrapper
    // itself failing. Whatever it applied first still has to reach the model.
    failed.push({
      opId: opIdFor('history'),
      reason: truncate(err instanceof Error
        ? err.message
        : 'the editor could not open an undo boundary for this batch'),
    })
  }

  // Ranked, not chronological. The cap keeps the FIRST MAX_WARNINGS, so
  // anything appended in op order can be evicted by whatever ran before it —
  // and permanent content loss is the one statement that must never be the
  // entry that falls off the end.
  const reported = [
    ...destructive, ...genericClearNotice(), ...critical, ...warnings,
  ].slice(0, MAX_WARNINGS)

  return {
    batchId: pending.batchId,
    applied: applied.slice(0, MAX_ENTRIES),
    failed: failed.slice(0, MAX_ENTRIES),
    ...(reported.length > 0 ? { warnings: reported } : {}),
  }
}
