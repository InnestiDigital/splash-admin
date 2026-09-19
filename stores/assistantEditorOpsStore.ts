import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SplashEditorOpsReport } from '~/admin/lib/protocol/types/splash-editor-context'

/**
 * Bound on the handled-batchId membership set. Insertion-order eviction (Set
 * iteration order == insertion order) keeps this a ring rather than an
 * unbounded, session-length leak. Mirrors MAX_HANDLED_PREFILL_IDS.
 */
export const MAX_HANDLED_EDITOR_BATCH_IDS = 50

/**
 * Assistant editor-op state that must outlive the drawer.
 *
 * R2E Plan C extends this store (the bounded handled-batch set, the last op
 * report, the drawer notice). Add to it; do not fork it.
 *
 * `editorMounted` is the single signal for "the operator is looking at the live
 * editor". It cannot be derived: `editorStore.currentPage` survives navigation
 * away from the editor page, so a hydrated page is not evidence of an open
 * editor (spec §5.2). Only the editor page writes it, from onMounted /
 * onUnmounted.
 *
 * A Pinia store rather than composable state because the assistant drawer now
 * mounts in two layouts and remounts when the operator moves between them; the
 * batch replay guard that lands here next must survive that remount.
 */
export const useAssistantEditorOpsStore = defineStore('assistant-editor-ops', () => {
  const editorMounted = ref(false)

  function setEditorMounted(mounted: boolean): void {
    editorMounted.value = mounted
  }

  // ── editor-ops bookkeeping ──
  //
  // This state must OUTLIVE the assistant drawer. The drawer mounts in both the
  // `admin` and `admin-editor` layouts and remounts when the operator moves
  // between them; a composable-local replay guard would reset on that remount
  // and let a STATE_SNAPSHOT replay apply a destructive batch twice (ruling 8).
  const lastReport = ref<SplashEditorOpsReport | null>(null)
  const notice = ref<string | null>(null)
  /** Not a ref: membership only, never rendered, and reactivity would be noise. */
  const handledBatchIds = new Set<string>()
  /** Reports feed the NEXT turn's digest once; lastReport keeps rendering. */
  let unreported: SplashEditorOpsReport | null = null

  function hasHandled(batchId: string): boolean {
    return handledBatchIds.has(batchId)
  }

  function recordHandled(batchId: string): void {
    handledBatchIds.add(batchId)
    if (handledBatchIds.size > MAX_HANDLED_EDITOR_BATCH_IDS) {
      const oldest = handledBatchIds.values().next().value
      if (oldest !== undefined) handledBatchIds.delete(oldest)
    }
    // A previous batch's report/notice must not linger over the next one.
    lastReport.value = null
    unreported = null
    notice.value = null
  }

  function setReport(report: SplashEditorOpsReport): void {
    lastReport.value = report
    unreported = report
    // A previous batch's "not applied" notice must not linger next to this report.
    notice.value = null
  }

  /** At-most-once feed into the digest; the drawer still reads `lastReport`. */
  function consumeReport(): SplashEditorOpsReport | null {
    const pending = unreported
    unreported = null
    return pending
  }

  function setNotice(message: string | null): void {
    notice.value = message
  }

  // ── batch serialisation ──
  //
  // `applyEditorOpBatch` is NOT re-entrant: `withHistorySuppressed` is a
  // store-GLOBAL flag that restores the previous value rather than clearing, so
  // two overlapping batches nest and the inner one's ops become unundoable.
  //
  // The queue therefore lives at the same scope as the flag it protects. A
  // composable-local tail would serialise per INSTANCE, and the drawer renders
  // in both the `admin` and `admin-editor` layouts — Vue can mount the incoming
  // instance before the outgoing one's scope is disposed (the same race
  // `clearEditorDigestProvider` exists for), and unmounting stops the watcher
  // without cancelling a batch already queued on the old chain. Shell → editor
  // navigation is the likeliest trigger, since it is exactly the recovery the
  // "open a page in the editor" notice asks the operator to perform.
  //
  // The replay guard does not cover this: it dedupes one batchId, not two
  // different batches arriving on two chains.
  let tail: Promise<void> = Promise.resolve()

  /** Run `batch` after every batch already queued, whichever drawer queued it. */
  function enqueueBatch(batch: () => Promise<void>): Promise<void> {
    const next = tail.then(batch)
    // The chain continues past a rejection — one failed batch must not poison
    // every later one — and the caller still sees `next` reject.
    tail = next.catch(() => {})
    return next
  }

  return {
    editorMounted,
    setEditorMounted,
    lastReport,
    notice,
    hasHandled,
    recordHandled,
    setReport,
    consumeReport,
    setNotice,
    enqueueBatch,
  }
})
