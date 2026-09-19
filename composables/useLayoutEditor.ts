import { ref, computed, toRaw } from 'vue'
import type { ThemeLayout, LayoutChromeElement } from '~/shared/types/layout'

/**
 * Deep clone via JSON round-trip. Avoids `structuredClone` because Vue's
 * reactive Proxies fail with `DataCloneError` when passed in directly, and
 * `toRaw()` only unwraps one level — nested objects remain proxies.
 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Editing harness for a single ThemeLayout.
 *
 * Wraps the layout in a deep-cloned ref, tracks dirtiness against a JSON
 * snapshot of the original, and exposes mutators for the chrome-elements
 * collection (which the panels reach into directly).
 */
export function useLayoutEditor(initial: ThemeLayout) {
  const layout = ref<ThemeLayout>(clone(toRaw(initial)))
  const original = ref(JSON.stringify(toRaw(initial)))
  const dirty = computed(() => JSON.stringify(layout.value) !== original.value)

  function updateSection<K extends keyof ThemeLayout>(key: K, patch: Partial<ThemeLayout[K]>) {
    const current = (layout.value[key] ?? {}) as any
    ;(layout.value as any)[key] = { ...current, ...patch }
  }

  function addChromeElement(elem: LayoutChromeElement) {
    if (!layout.value.chrome) layout.value.chrome = { elements: [] }
    layout.value.chrome.elements.push(elem)
  }

  function removeChromeElement(id: string) {
    if (!layout.value.chrome) return
    layout.value.chrome.elements = layout.value.chrome.elements.filter(e => e.id !== id)
  }

  function updateChromeElement(id: string, patch: Partial<LayoutChromeElement>) {
    if (!layout.value.chrome) return
    const idx = layout.value.chrome.elements.findIndex(e => e.id === id)
    if (idx === -1) return
    layout.value.chrome.elements[idx] = {
      ...layout.value.chrome.elements[idx],
      ...patch,
    } as LayoutChromeElement
  }

  function reset(next?: ThemeLayout) {
    const target = toRaw(next ?? initial)
    layout.value = clone(target)
    original.value = JSON.stringify(target)
  }

  /** Discard local edits since the last save (or init), reverting to `original`. */
  function revertToSaved() {
    layout.value = JSON.parse(original.value)
  }

  function markClean() {
    original.value = JSON.stringify(layout.value)
  }

  return {
    layout,
    dirty,
    updateSection,
    addChromeElement,
    removeChromeElement,
    updateChromeElement,
    reset,
    revertToSaved,
    markClean,
  }
}

/**
 * Produce a sensible default chrome element for a given type.
 * Used by panels offering "+ Line / + Shape / + Image / + Text" buttons.
 */
export function makeDefaultChromeElement(
  type: LayoutChromeElement['type'],
  id: string = `${type}-${Math.random().toString(36).slice(2, 8)}`,
): LayoutChromeElement {
  const base = {
    id,
    enabled: true,
    layer: 'background' as const,
    position: 'fixed' as const,
    anchor: 'top-left' as const,
    offsetX: '0',
    offsetY: '0',
    zIndex: 0,
  }
  switch (type) {
    case 'line':
      return {
        ...base,
        type: 'line',
        orientation: 'vertical',
        color: '#000000',
        thickness: '1px',
        length: '100vh',
      }
    case 'shape':
      return {
        ...base,
        type: 'shape',
        shape: 'rectangle',
        color: '#000000',
        width: '100px',
        height: '100px',
      }
    case 'image':
      return {
        ...base,
        type: 'image',
        src: '',
        width: '100px',
      }
    case 'text':
      return {
        ...base,
        type: 'text',
        text: '',
      }
  }
}
