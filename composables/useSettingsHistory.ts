import { ref, type Ref } from 'vue'

interface UseSettingsHistoryReturn {
  push: (state: Record<string, any>) => void
  undo: () => Record<string, any> | null
  redo: () => Record<string, any> | null
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  clear: () => void
}

const MAX_HISTORY = 50

/**
 * Simple undo/redo stack for settings objects.
 * Call `push()` on each change, `undo()`/`redo()` to navigate.
 * Returns the state to restore, or null if at boundary.
 */
export function useSettingsHistory(): UseSettingsHistoryReturn {
  const past = ref<string[]>([])
  const future = ref<string[]>([])
  const canUndo = ref(false)
  const canRedo = ref(false)

  function updateFlags() {
    // past[0] is the baseline snapshot the caller pushes on init, so there is
    // something to undo *to* only once a second entry exists.
    canUndo.value = past.value.length > 1
    canRedo.value = future.value.length > 0
  }

  function push(state: Record<string, any>) {
    past.value.push(JSON.stringify(state))
    if (past.value.length > MAX_HISTORY) {
      past.value.shift()
    }
    // New change invalidates future
    future.value = []
    updateFlags()
  }

  function undo(): Record<string, any> | null {
    // Non-destructive at the boundary: never consume the baseline, or the
    // caller loses the state it started from with no way back.
    if (past.value.length <= 1) return null
    const current = past.value.pop()!
    future.value.push(current)
    const previous = past.value[past.value.length - 1]
    updateFlags()
    return previous ? JSON.parse(previous) : null
  }

  function redo(): Record<string, any> | null {
    if (future.value.length === 0) return null
    const next = future.value.pop()!
    past.value.push(next)
    updateFlags()
    return JSON.parse(next)
  }

  function clear() {
    past.value = []
    future.value = []
    updateFlags()
  }

  return { push, undo, redo, canUndo, canRedo, clear }
}
