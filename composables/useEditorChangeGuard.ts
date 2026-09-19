import { onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useEditorChangeStore } from '~/admin/stores/editorChangeStore'

export interface UseEditorChangeGuardOptions {
  /** Injectable for focused tests; the editor uses Nuxt's same-origin navigation. */
  navigate?: (destination: string) => Promise<unknown> | unknown
}

/**
 * Flush the editor's canonical save queue before it loses its authoring context.
 *
 * Route guards cover browser history and indirect links. `safeNavigate` gives
 * explicit editor actions (Exit / Publish) the same contract while exposing a
 * pending state to their controls. A browser unload cannot await requests, so
 * it falls back to the platform's native unsaved-work warning.
 */
export function useEditorChangeGuard(options: UseEditorChangeGuardOptions = {}) {
  const changes = useEditorChangeStore()
  const navigating = ref(false)

  async function flushForNavigation(): Promise<boolean> {
    const result = await changes.flushAll(true)
    return result.ok
  }

  async function safeNavigate(destination: string): Promise<boolean> {
    if (navigating.value) return false
    navigating.value = true
    try {
      if (!await flushForNavigation()) return false
      const navigate = options.navigate ?? ((target: string) => navigateTo(target))
      await navigate(destination)
      return true
    } finally {
      navigating.value = false
    }
  }

  // A route can leave this component, or reuse it while program/site params
  // change. Both destroy the current authoring context and need the same gate.
  onBeforeRouteLeave(async () => await flushForNavigation() || false)
  onBeforeRouteUpdate(async () => await flushForNavigation() || false)

  function beforeUnloadHandler(event: BeforeUnloadEvent): void {
    if (!changes.needsAttention) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', beforeUnloadHandler)
    }
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
  })

  return {
    navigating,
    flushForNavigation,
    safeNavigate,
    beforeUnloadHandler,
  }
}
