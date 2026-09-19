import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Close-on-outside-click composable.
 *
 * Attaches a document-level listener (on `mousedown` by default) that invokes
 * the provided callback when a click occurs outside the referenced element.
 * The listener is automatically added on mount and removed on unmount, keeping
 * cleanup consistent across consumers.
 *
 * Multiple elements can be passed to treat several regions as "inside" — useful
 * for dropdowns whose toggle button and panel live in separate refs.
 *
 * SSR safety: no guards needed because the admin SPA runs client-only
 * (SSR is disabled in nuxt.config). If reused elsewhere, wrap document access.
 *
 * @example
 *   const root = ref<HTMLElement | null>(null)
 *   const open = ref(false)
 *   useClickOutside(root, () => { open.value = false })
 */
export function useClickOutside(
  elementRefs: Ref<HTMLElement | null> | Array<Ref<HTMLElement | null>>,
  callback: (event: MouseEvent) => void,
  options: { event?: 'click' | 'mousedown'; active?: Ref<boolean> } = {},
): void {
  const event = options.event ?? 'mousedown'
  const refs = Array.isArray(elementRefs) ? elementRefs : [elementRefs]

  function handler(e: MouseEvent) {
    if (options.active && !options.active.value) return
    const target = e.target as Node | null
    if (!target) return
    for (const r of refs) {
      const el = r.value
      if (el && el.contains(target)) return
    }
    callback(e)
  }

  onMounted(() => {
    document.addEventListener(event, handler, true)
  })
  onUnmounted(() => {
    document.removeEventListener(event, handler, true)
  })
}
