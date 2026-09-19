import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BlockPlacementConfig } from '~/shared/types/placement'

/**
 * A block copied to the editor clipboard. Holds everything needed to
 * re-create the block on any page of the current site (same theme), so an
 * author can copy a configured block on one page and paste it onto another.
 */
export interface CopiedBlock {
  type: string
  /** Human label captured at copy time, for the paste affordance. */
  label: string
  settings: Record<string, any>
  options?: Record<string, any>
  events?: string[]
  layoutRole?: string | null
  placement?: BlockPlacementConfig
}

const STORAGE_KEY = 'splash:editor:clipboard'

/**
 * Best-effort rehydrate from sessionStorage so a copied block survives an
 * editor reload within the same tab/session. sessionStorage can throw
 * (private mode, disabled storage) — in that case we simply start empty; the
 * in-memory ref is the source of truth, persistence is only a convenience.
 */
function readPersisted(): CopiedBlock | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.type === 'string' &&
      parsed.settings &&
      typeof parsed.settings === 'object'
    ) {
      return parsed as CopiedBlock
    }
    return null
  } catch {
    // Storage unavailable or corrupt payload — degrade to empty clipboard.
    return null
  }
}

/**
 * Editor block clipboard. Separate from the OS clipboard: it holds a
 * structured block payload, persists across in-app page navigation (Pinia)
 * and across reloads within the session (sessionStorage).
 */
export const useClipboardStore = defineStore('clipboard', () => {
  const copiedBlock = ref<CopiedBlock | null>(readPersisted())
  const hasCopiedBlock = computed(() => copiedBlock.value !== null)

  function copy(block: CopiedBlock) {
    copiedBlock.value = block
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(block))
      } catch {
        // Quota exceeded / storage disabled — the in-memory copy still works.
      }
    }
  }

  function clear() {
    copiedBlock.value = null
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // Non-fatal — the in-memory clipboard was already cleared above.
      }
    }
  }

  return { copiedBlock, hasCopiedBlock, copy, clear }
})
