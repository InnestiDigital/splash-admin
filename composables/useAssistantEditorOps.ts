import { watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAssistantStore } from '~/admin/stores/assistantStore'
import {
  useAssistantEditorOpsStore,
  MAX_HANDLED_EDITOR_BATCH_IDS,
} from '~/admin/stores/assistantEditorOpsStore'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { applyEditorOpBatch } from '~/admin/utils/editorOps/applyEditorOpBatch'
import { createLiveEditorOpsFacade } from '~/admin/utils/editorOps/facade'
import {
  SplashPendingEditorOpsSchema,
  type SplashPendingEditorOps,
} from '~/admin/lib/protocol/types/splash-editor-ops'

/**
 * Re-exported so the replay-guard bound has ONE definition. The set itself
 * lives in the store (it must survive the drawer's remount between the `admin`
 * and `admin-editor` layouts); a second constant here would be free to drift
 * from the eviction it describes.
 */
export { MAX_HANDLED_EDITOR_BATCH_IDS }

export type EditorOpsDecision =
  | { action: 'ignore' }
  | { action: 'block', batchId: string, notice: string }
  | { action: 'apply', batchId: string, pending: SplashPendingEditorOps }

const NOT_MOUNTED = 'Open a page in the editor and ask again — I can only edit live from the editor.'
const NO_SITE = 'Select a site first.'

/**
 * Trust boundary for the assistant's editor-op batch (spec §7), mirroring
 * resolveAssistantPrefill: schema violations ignored, replayed batchIds ignored
 * (store-backed set, id recorded BEFORE acting), site context and editor-mounted
 * gated, wrong page dropped.
 *
 * Every field of `payload` is hostile: it arrives from a model that a page's
 * own content can talk to. The only authority these ops carry is the operator's
 * own session — they execute as store calls hitting the same endpoints,
 * adminAuth middleware and RBAC matrix a click would.
 *
 * Pure by construction: every input is passed in and every gate returns a
 * decision rather than performing the side effect, so the whole gate ladder
 * unit-tests without Pinia, a router or a mounted editor.
 */
export function resolveAssistantEditorOps(input: {
  payload: unknown
  hasHandled: (batchId: string) => boolean
  hasSiteContext: boolean
  editorMounted: boolean
  openPageId: string | null
}): EditorOpsDecision {
  const parsed = SplashPendingEditorOpsSchema.safeParse(input.payload)
  if (!parsed.success) {
    if (input.payload !== null && import.meta.dev) {
      console.warn('[assistant] dropped invalid pendingEditorOps', parsed.error)
    }
    return { action: 'ignore' }
  }
  const pending = parsed.data

  // BEFORE every block gate: a replayed batch has already been answered once,
  // and re-emitting its notice would tell the operator a batch they watched
  // apply was refused.
  if (input.hasHandled(pending.batchId)) return { action: 'ignore' }

  if (!input.hasSiteContext) {
    return { action: 'block', batchId: pending.batchId, notice: NO_SITE }
  }
  // `editorMounted` cannot be derived from `currentPage`: editor stores survive
  // navigation away from the editor, so a hydrated page is not evidence of an
  // open editor (spec §5.2). Only the editor page writes the flag.
  if (!input.editorMounted) {
    return { action: 'block', batchId: pending.batchId, notice: NOT_MOUNTED }
  }
  if (!input.openPageId) {
    return { action: 'block', batchId: pending.batchId, notice: NOT_MOUNTED }
  }
  if (input.openPageId !== pending.pageId) {
    // `pending.pageId` is the runtime's copy of `editor.selection.pageId` —
    // this host's own digest, echoed back a turn later. It is a staleness
    // check, never an authority: the operator may have switched pages while
    // the model was thinking, and the live store is the only truth.
    //
    // Never switch pages on the model's behalf: switchPage flushes and
    // re-hydrates, destroying selection and block history, and doing that
    // silently under a chat message is exactly the surprise this design avoids.
    return {
      action: 'block',
      batchId: pending.batchId,
      notice: `That change targets page ${pending.pageId}, but ${input.openPageId} is open. Open that page and ask again.`,
    }
  }
  return { action: 'apply', batchId: pending.batchId, pending }
}

/**
 * Wire the widget-state slice to the executor. Call once from the drawer.
 *
 * Batches are serialised through the STORE's queue (`enqueueBatch`), not a
 * local one: `applyEditorOpBatch` is not re-entrant, and the drawer renders in
 * two layouts, so two live instances would each hold their own tail and neither
 * would gate the other's batch. See the store for the full argument.
 *
 * Chaining rather than dropping is deliberate: the second batch's gates are
 * evaluated when it RUNS, against the page the first batch left behind.
 */
export function useAssistantEditorOps(): { notice: Ref<string | null> } {
  const store = useAssistantStore()
  const opsStore = useAssistantEditorOpsStore()
  const editorStore = useEditorStore()
  const siteStore = useSiteStore()
  const programStore = useProgramStore()

  async function handle(payload: unknown): Promise<void> {
    const result = resolveAssistantEditorOps({
      payload,
      hasHandled: id => opsStore.hasHandled(id),
      hasSiteContext: !!(programStore.activeProgramId && siteStore.activeSiteId),
      editorMounted: opsStore.editorMounted,
      openPageId: editorStore.currentPage?.id ?? null,
    })
    if (result.action === 'ignore') return

    // Recorded BEFORE acting: a throw mid-batch must not leave the id
    // un-recorded, or a replay would re-run the ops that already landed.
    // `recordHandled` also clears the previous batch's report and notice, so
    // nothing below it may be written before this call.
    opsStore.recordHandled(result.batchId)
    store.clearPendingEditorOps()

    if (result.action === 'block') {
      opsStore.setNotice(result.notice)
      return
    }
    const report = await applyEditorOpBatch(result.pending, createLiveEditorOpsFacade())
    opsStore.setReport(report)
  }

  watch(() => store.widgetState.pendingEditorOps, (payload) => {
    void opsStore.enqueueBatch(() => handle(payload)).catch((err: unknown) => {
      // `applyEditorOpBatch` folds per-op throws into its report, so reaching
      // here means the wiring itself failed (a store action throwing outside a
      // guarded await). Surface it to the operator instead of leaving the
      // drawer silent; the store's queue keeps running either way.
      opsStore.setNotice(
        err instanceof Error
          ? `That change could not be applied: ${err.message}`
          : 'That change could not be applied.',
      )
    })
  })

  // The store's notice, not a composable-local ref: the drawer remounts across
  // layouts and a local ref would drop the notice the batch just produced.
  const { notice } = storeToRefs(opsStore)
  return { notice }
}
