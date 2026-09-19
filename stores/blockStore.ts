import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Block } from '~/server/storage/types'
import type { BlockPlacementConfig } from '~/shared/types/placement'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { usePageStore } from '~/admin/stores/pageStore'
import { adminFetch } from '~/admin/utils/adminFetch'

export interface UpdateBlockPlacementOptions {
  /**
   * Placement commits participate in the existing block undo/redo history by
   * default. Set this to false only when the caller has already recorded a
   * containing transaction that must remain a single user-visible undo step.
   */
  recordHistory?: boolean
}

function clonePlacement(placement: BlockPlacementConfig): BlockPlacementConfig {
  return JSON.parse(JSON.stringify(placement))
}

function placementsEqual(left: BlockPlacementConfig, right: BlockPlacementConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Blocks, per-block placement, and block history (undo/redo).
 *
 * Async API calls live in the proxy coordinator (editorStore.ts) except for
 * placement persistence. Placement contributes immutable jobs to the shared
 * editor change coordinator so it can be flushed before navigation/undo and
 * retried after failure without losing the local draft.
 */
export const useBlockStore = defineStore('editor-block', () => {
  const siteStore = useSiteStore()
  const pageStore = usePageStore()
  const changeStore = useEditorChangeStore()

  // ── State ──
  const blocks = ref<Block[]>([])
  const blockPlacement = ref<Record<string, BlockPlacementConfig>>({})

  // ── Block history for undo/redo ──
  const MAX_BLOCK_HISTORY = 20
  let _blockHistoryPast: string[] = []
  let _blockHistoryFuture: string[] = []
  const canUndoBlocks = ref(false)
  const canRedoBlocks = ref(false)
  let _historySuppressed = false

  function updateBlockHistoryFlags() {
    canUndoBlocks.value = _blockHistoryPast.length > 0
    canRedoBlocks.value = _blockHistoryFuture.length > 0
  }

  /**
   * Record the current block state as an undo snapshot.
   *
   * Returns false when the snapshot is deliberately skipped so callers that
   * later roll back a failed operation do not discard an older valid entry.
   */
  function pushBlockHistory(): boolean {
    // Suppressed: report "not recorded" so a caller's failure path discards
    // nothing — there is no entry of its own to discard.
    if (_historySuppressed) return false
    const snapshot = JSON.stringify(blocks.value)
    if (snapshot.length > 500_000) return false
    _blockHistoryPast.push(snapshot)
    if (_blockHistoryPast.length > MAX_BLOCK_HISTORY) {
      _blockHistoryPast.shift()
    }
    _blockHistoryFuture = []
    updateBlockHistoryFlags()
    return true
  }

  function popHistoryForUndo(): string | null {
    if (_blockHistoryPast.length === 0) return null
    const current = JSON.stringify(blocks.value)
    _blockHistoryFuture.push(current)
    const previous = _blockHistoryPast.pop()!
    updateBlockHistoryFlags()
    return previous
  }

  function rollbackUndo(previousSnapshot: string, currentSnapshot: string) {
    // Server failed — restore in-memory state and stacks
    _blockHistoryFuture.pop()
    _blockHistoryPast.push(previousSnapshot)
    blocks.value = JSON.parse(currentSnapshot)
    updateBlockHistoryFlags()
  }

  function popHistoryForRedo(): string | null {
    if (_blockHistoryFuture.length === 0) return null
    const current = JSON.stringify(blocks.value)
    _blockHistoryPast.push(current)
    const next = _blockHistoryFuture.pop()!
    updateBlockHistoryFlags()
    return next
  }

  function rollbackRedo(nextSnapshot: string, currentSnapshot: string) {
    // Server failed — restore in-memory state and stacks
    _blockHistoryPast.pop()
    _blockHistoryFuture.push(nextSnapshot)
    blocks.value = JSON.parse(currentSnapshot)
    updateBlockHistoryFlags()
  }

  /**
   * Discard the last snapshot pushed by `pushBlockHistory` without touching
   * the redo stack. Used by add/delete/reorder/duplicate on API failure —
   * the operation never completed so we just forget the pre-op snapshot.
   */
  function discardLastHistoryEntry() {
    if (_blockHistoryPast.length > 0) {
      _blockHistoryPast.pop()
      updateBlockHistoryFlags()
    }
  }

  function clearBlockHistory() {
    _blockHistoryPast = []
    _blockHistoryFuture = []
    updateBlockHistoryFlags()
  }

  /**
   * Run `fn` with `pushBlockHistory` turned into a no-op.
   *
   * Several structural actions snapshot for themselves, which is right for a
   * single click and wrong for a batch: the assistant applies a group of ops as
   * one user-visible change and promises one Cmd-Z for it (assistant spec §5.6).
   * The batch takes its own snapshot first and runs inside this. The assistant
   * op executor is the only intended caller.
   *
   * Restores the previous value rather than clearing, so nesting behaves.
   *
   * The flag is store-global and suppression spans network awaits, so it is
   * deliberately NOT concurrency-safe — and the leak this permits is reachable
   * today, not just a hypothetical about concurrent batches. While
   * `moveBlockToSection` awaits its `replace-all` round trip inside a suppressed
   * region, a canvas drag arriving from the preview iframe routes through
   * `updateBlockPlacement` -> `pushBlockHistory` and is suppressed too: the
   * operator silently loses one undo step for an action of their own. That is
   * accepted for now — the window is one request long and the editor is
   * otherwise a single writer whose structural work runs behind a change-store
   * barrier.
   */
  async function withHistorySuppressed<T>(fn: () => T | Promise<T>): Promise<T> {
    const previous = _historySuppressed
    _historySuppressed = true
    try {
      return await fn()
    }
    finally {
      _historySuppressed = previous
    }
  }

  // ── State setters (called by proxy coordinator) ──

  /**
   * Initialise blocks and placement map from a freshly loaded page.
   */
  function initFromPage(pageBlocks: Block[]) {
    blocks.value = pageBlocks
    const placementMap: Record<string, BlockPlacementConfig> = {}
    for (const block of pageBlocks) {
      if (block.placement) placementMap[block.id] = block.placement
    }
    blockPlacement.value = placementMap
  }

  function setBlocks(newBlocks: Block[]) {
    blocks.value = newBlocks
  }

  function syncPlacementFromBlocks() {
    const placementMap: Record<string, BlockPlacementConfig> = {}
    for (const block of blocks.value) {
      if (block.placement) placementMap[block.id] = block.placement
    }
    blockPlacement.value = placementMap
  }

  function addBlockToState(block: Block) {
    blocks.value.push(block)
    blockPlacement.value[block.id] = block.placement ?? {}
  }

  function removeBlockFromState(blockId: string) {
    blocks.value = blocks.value.filter(b => b.id !== blockId)
    delete blockPlacement.value[blockId]
  }

  /**
   * Move a block into another section at a given index inside that section.
   *
   * No human editor action does this today (`SectionList.onBlockDrop` reorders
   * within one section) and `PUT blocks/:blockId` swallows `sectionId` into
   * settings, so the move is expressed as a whole-array rewrite persisted with
   * `blocks/replace-all` — the same transport undo uses. The array being
   * rewritten is the live one the operator is editing, never a re-read.
   *
   * On a page whose block array serialises past the 500KB snapshot cap,
   * `pushBlockHistory` declines and this move records NO undo entry — while
   * still persisting a whole-array delete-all/reinsert. The largest pages are
   * the ones where the move is least reversible.
   */
  async function moveBlockToSection(
    blockId: string,
    toSectionId: string,
    indexInSection: number,
    layoutRole?: string | null,
  ): Promise<boolean> {
    const pageId = pageStore.currentPage?.id
    const apiBase = siteStore.apiBase
    if (!pageId || !apiBase) return false

    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return false

    const moving = blocks.value.find(block => block.id === blockId)
    if (!moving) return false

    const previousSnapshot = JSON.stringify(blocks.value)
    const historyRecorded = pushBlockHistory()

    const rest = blocks.value.filter(block => block.id !== blockId)
    const members = rest.filter(block => block.sectionId === toSectionId)
    const clamped = Math.max(0, Math.min(indexInSection, members.length))
    const anchor = members[clamped]
    const lastMember = members[members.length - 1]

    // Insert before the member currently at that index; past the end, land
    // after the section's last member so the block does not jump the page.
    const insertAt = anchor
      ? rest.findIndex(block => block.id === anchor.id)
      : lastMember
        ? rest.findIndex(block => block.id === lastMember.id) + 1
        : rest.length

    const moved: Block = {
      ...moving,
      sectionId: toSectionId,
      ...(layoutRole !== undefined ? { layoutRole } : {}),
    }
    blocks.value = [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)]
      .map((block, position) => ({ ...block, position }))

    const replacement = JSON.parse(JSON.stringify(blocks.value))
    try {
      await changeStore.runOperation({
        key: operationKey,
        label: 'Move block',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          await adminFetch(`${apiBase}/pages/${pageId}/blocks/replace-all`, {
            method: 'PUT',
            body: { blocks: replacement },
          })
        },
      })
      return true
    }
    catch {
      // Omitting syncPlacementFromBlocks() here is deliberate, unlike the
      // sibling array-restore paths in undo/redo: a move rewrites sectionId,
      // layoutRole and position only, so no placement content or block id
      // changed and the map is already correct. Any future path that restores
      // an array whose placement could differ must call it.
      blocks.value = JSON.parse(previousSnapshot)
      if (historyRecorded) discardLastHistoryEntry()
      return false
    }
  }

  // ── Placement save queue ──

  function getBlockPlacement(blockId: string): BlockPlacementConfig {
    return blockPlacement.value[blockId] ?? {}
  }

  function updateBlockPlacement(
    blockId: string,
    placement: BlockPlacementConfig,
    options: UpdateBlockPlacementOptions = {},
  ): void {
    const nextPlacement = clonePlacement(placement)
    const previousPlacement = getBlockPlacement(blockId)
    if (placementsEqual(previousPlacement, nextPlacement)) return

    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (options.recordHistory !== false && idx !== -1) pushBlockHistory()

    blockPlacement.value[blockId] = nextPlacement
    // Sync to blocks array so buildPreviewConfig sends updated placement to preview
    if (idx !== -1) {
      const current = blocks.value[idx]
      if (current) blocks.value[idx] = { ...current, placement: nextPlacement }
    }

    // Capture target and payload now. Page navigation and later local edits
    // must never redirect this revision or mutate the body while it is queued.
    const pageId = pageStore.currentPage?.id ?? null
    const apiBase = siteStore.apiBase
    const payload = clonePlacement(nextPlacement)
    const canPersist = Boolean(pageId && apiBase)
    changeStore.queue({
      key: editorChangeKey.placement(pageId, blockId),
      surface: 'placement',
      scope: editorChangeScope.page(pageId ?? 'no-page'),
      label: 'Canvas placement',
      valid: canPersist,
      blockedReason: canPersist
        ? undefined
        : 'Cannot save placement without an active page and site',
      run: async () => {
        if (!pageId || !apiBase) {
          throw new Error('Cannot save placement without an active page and site')
        }
        await adminFetch(`${apiBase}/pages/${pageId}/blocks/${blockId}`, {
          method: 'PUT',
          body: { placement: payload },
        })
      },
    })
  }

  function placementJobKeys(blockIds?: readonly string[]): string[] {
    const jobs = changeStore.jobList.filter(job => job.surface === 'placement')
    if (!blockIds) return jobs.map(job => job.key)
    const suffixes = blockIds.map(blockId => `:${blockId}`)
    return jobs
      .filter(job => suffixes.some(suffix => job.key.endsWith(suffix)))
      .map(job => job.key)
  }

  /**
   * Explicitly abandon placement work after an authoritative state replacement
   * (successful page hydration/reset). Navigation and undo must flush first.
   */
  function discardPlacementSaves(blockIds?: readonly string[]): void {
    for (const key of placementJobKeys(blockIds)) changeStore.discardJob(key)
  }

  return {
    blocks,
    blockPlacement,
    canUndoBlocks,
    canRedoBlocks,
    // History helpers (used by proxy coordinator)
    pushBlockHistory,
    discardLastHistoryEntry,
    popHistoryForUndo,
    rollbackUndo,
    popHistoryForRedo,
    rollbackRedo,
    clearBlockHistory,
    withHistorySuppressed,
    // State setters (called by proxy coordinator)
    initFromPage,
    setBlocks,
    syncPlacementFromBlocks,
    addBlockToState,
    removeBlockFromState,
    moveBlockToSection,
    // Placement
    getBlockPlacement,
    updateBlockPlacement,
    discardPlacementSaves,
  }
})
