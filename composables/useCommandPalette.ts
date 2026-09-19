import { ref, readonly } from 'vue'

/**
 * Global open-state for the admin command palette (⌘K / Ctrl-K).
 *
 * A module-level singleton ref so any admin component can open the palette
 * (the icon-strip trigger, the global keyboard shortcut, future deep-links)
 * while a single <AdminCommandPalette> instance, mounted once in Layout.vue,
 * owns the rendering. SSR is disabled in this app, so a module singleton is
 * safe (no cross-request state bleed).
 */
const isOpen = ref(false)

export function useCommandPalette() {
  function open() {
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  function toggle() {
    isOpen.value = !isOpen.value
  }
  return { isOpen: readonly(isOpen), open, close, toggle }
}
