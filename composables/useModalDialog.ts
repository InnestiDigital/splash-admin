import { nextTick, onUnmounted, watch, type Ref } from 'vue'

/**
 * Modal-dialog behaviour for admin overlays: Escape to close, a Tab focus trap,
 * initial focus, focus restoration to whatever opened the dialog, and a body
 * scroll lock while it is open.
 *
 * The theme side learned this contract the hard way on the public lightbox and
 * the nav drawer: first/last wrapping alone is NOT enough, because a pointerdown
 * on the backdrop blurs the active control without focusing anything, parking
 * `document.activeElement` on `<body>`. Tabbing from there walks the page behind
 * the overlay — in the admin that is the whole editor, invisible under the
 * backdrop but fully interactive. So the trap re-enters the dialog from anywhere
 * outside it, not just at the boundaries.
 *
 * SSR safety: no guards needed, the admin SPA is client-only (SSR disabled in
 * nuxt.config).
 *
 * @example
 *   const dialog = ref<HTMLElement | null>(null)
 *   useModalDialog({
 *     open: toRef(props, 'open'),
 *     dialog,
 *     onClose: () => emit('cancel'),
 *     initialFocus: () => dialog.value?.querySelector('input'),
 *   })
 */
export interface ModalDialogOptions {
  /** Whether the dialog is currently rendered. */
  open: Ref<boolean>
  /** The dialog element itself (the `role="dialog"` node, not the backdrop). */
  dialog: Ref<HTMLElement | null>
  /** Invoked on Escape. The consumer owns the actual close. */
  onClose: () => void
  /** Element to focus on open. Falls back to the first focusable, then the dialog. */
  initialFocus?: () => HTMLElement | null | undefined
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]',
].join(',')

/**
 * Focusable candidates inside the dialog.
 *
 * Deliberately NOT filtered on rendered visibility (`offsetParent`, client
 * rects): the admin test environment (happy-dom) reports no layout at all, so a
 * visibility filter would report every control as unfocusable and silently make
 * the trap untestable. `disabled` / `hidden` / `tabindex="-1"` cover what this
 * codebase actually hides inside a dialog — including the file input behind the
 * upload button.
 */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      !el.hasAttribute('hidden') &&
      el.getAttribute('tabindex') !== '-1' &&
      el.getAttribute('type') !== 'hidden',
  )
}

/**
 * Every open dialog, in the order it opened. Only the last one handles keys.
 *
 * Two dialogs open at once otherwise FIGHT: the outer one's trap sees focus
 * sitting in the inner one as "outside my dialog" and yanks it back, and a
 * single Escape closes both. Ordering by open time — not by DOM nesting —
 * is what makes a dialog opened FROM another dialog (the media picker over a
 * settings overlay) the one that owns the keyboard.
 */
const openDialogs: object[] = []

function pushDialog(token: object) {
  removeDialog(token)
  openDialogs.push(token)
}

function removeDialog(token: object) {
  const index = openDialogs.indexOf(token)
  if (index !== -1) openDialogs.splice(index, 1)
}

/**
 * Whether ANY modal dialog is currently open.
 *
 * The trap above owns Tab and Escape, but it cannot own the shortcuts a
 * component BEHIND the backdrop registered on `window` itself. The editor's
 * `NavigationTree` is the standing example: with an overlay open, Delete still
 * reached the selected block and destroyed it under a backdrop the author could
 * not see through. Any such global listener must bail while a dialog is open,
 * and asking here is what makes that one guard cover every overlay at once
 * instead of one per-overlay flag each new dialog has to remember to add.
 */
export function isModalDialogOpen(): boolean {
  return openDialogs.length > 0
}

export function useModalDialog(options: ModalDialogOptions): void {
  const { open, dialog, onClose, initialFocus } = options

  /** Identity for this instance's slot in `openDialogs`. */
  const token: object = {}
  let lastFocused: HTMLElement | null = null
  let previousOverflow: string | null = null

  function lockScroll() {
    if (previousOverflow !== null) return
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }

  function unlockScroll() {
    if (previousOverflow === null) return
    document.body.style.overflow = previousOverflow
    previousOverflow = null
  }

  function trapFocus(e: KeyboardEvent) {
    const dlg = dialog.value
    if (!dlg) return
    const focusable = focusableWithin(dlg)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    // Focus can sit OUTSIDE the dialog while it is open (a click on the backdrop
    // blurs without focusing). Re-enter from anywhere out, not just at the ends.
    if (!(active instanceof HTMLElement) || !dlg.contains(active)) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
      return
    }
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open.value) return
    if (openDialogs[openDialogs.length - 1] !== token) return
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Tab') {
      trapFocus(e)
    }
  }

  watch(
    open,
    (isOpen, wasOpen) => {
      if (isOpen) {
        lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        pushDialog(token)
        lockScroll()
        window.addEventListener('keydown', onKeydown)
        void nextTick(() => {
          if (!open.value) return
          const dlg = dialog.value
          const target = initialFocus?.() ?? (dlg ? focusableWithin(dlg)[0] : null) ?? dlg
          target?.focus()
        })
        return
      }
      // Never restore focus on the initial `open=false` run — nothing was taken.
      if (wasOpen === undefined) return
      window.removeEventListener('keydown', onKeydown)
      removeDialog(token)
      unlockScroll()
      const restore = lastFocused
      lastFocused = null
      void nextTick(() => restore?.focus?.())
    },
    { immediate: true },
  )

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    removeDialog(token)
    unlockScroll()
  })
}
