import type { BlockPlacementConfig } from '~/shared/types/placement'
import { BRAND_CANVAS_PAGE_TYPE } from '~/shared/types/brandCanvas'
import { isCanvasBlockPlacementPatchMessage } from '~/shared/types/previewMessages'

/**
 * The narrow editor-store surface needed to commit a preview-side canvas
 * gesture. Keeping this independent of Pinia makes the postMessage boundary
 * straightforward to exercise without mounting the whole preview panel.
 */
export interface CanvasPlacementPatchTarget {
  readonly currentPage?: { pageType?: string | null } | null
  readonly blocks: readonly { id: string; sectionId?: string | null }[]
  readonly sections?: readonly { id: string; sectionType?: string | null }[]
  getBlockPlacement: (blockId: string) => BlockPlacementConfig
  updateBlockPlacement: (blockId: string, placement: BlockPlacementConfig) => unknown
}

/**
 * Validate and apply one committed canvas geometry patch.
 *
 * Mirrors the server gate in `server/services/sections/canvasPlacementPolicy.ts`:
 * geometry is legal on a brand-canvas page, and in a section whose type declares
 * a `flow: "layered"` slot. Accepting more here than the API will take means the
 * editor shows a move that the next save rejects with a 422 the author cannot
 * act on, so this side stays the stricter of the two by construction — an empty
 * `layeredSectionTypes` reduces it to the brand-canvas-only rule.
 *
 * Returning false means the message was ignored without touching editor state.
 */
export function applyCanvasBlockPlacementPatch(
  target: CanvasPlacementPatchTarget,
  message: unknown,
  layeredSectionTypes: ReadonlySet<string> = new Set(),
): boolean {
  if (!isCanvasBlockPlacementPatchMessage(message)) return false

  const block = target.blocks.find(candidate => candidate.id === message.blockId)
  if (!block) return false
  if (!allowsCanvasGeometry(target, block, layeredSectionTypes)) return false

  const placement = target.getBlockPlacement(message.blockId)
  target.updateBlockPlacement(message.blockId, {
    ...placement,
    canvas: {
      ...placement.canvas,
      ...message.patch,
    },
  })
  return true
}

/**
 * May a block in this position carry `placement.canvas`?
 *
 * The client half of `server/services/sections/canvasPlacementPolicy.ts`, in the
 * same argument shape and the same order: a brand-canvas page is free placement
 * end to end, and on an ordinary page geometry is legal exactly inside a section
 * whose type declares a layered slot. Exported because the assistant's
 * `set_block_placement` op asks the identical question — a second copy there
 * would be the drift that policy module's header exists to prevent, and it would
 * fail in the direction that hurts: refusing a move the API would accept.
 *
 * An empty `layeredSectionTypes` reduces this to the brand-canvas-only rule,
 * which keeps this side the stricter of the two by construction.
 */
export function canvasGeometryAllowed(
  pageType: string | null | undefined,
  sectionType: string | null | undefined,
  layeredSectionTypes: ReadonlySet<string>,
): boolean {
  if (pageType === BRAND_CANVAS_PAGE_TYPE) return true
  // An unsectioned block on an ordinary page has no layout that could position
  // it, so it never qualifies.
  if (typeof sectionType !== 'string' || sectionType.length === 0) return false
  return layeredSectionTypes.has(sectionType)
}

function allowsCanvasGeometry(
  target: CanvasPlacementPatchTarget,
  block: { sectionId?: string | null },
  layeredSectionTypes: ReadonlySet<string>,
): boolean {
  const section = block.sectionId
    ? target.sections?.find(candidate => candidate.id === block.sectionId)
    : undefined
  return canvasGeometryAllowed(
    target.currentPage?.pageType, section?.sectionType, layeredSectionTypes,
  )
}
