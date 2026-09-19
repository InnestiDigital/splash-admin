<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ksh-overlay"
      @click.self="emit('close')"
    >
      <!-- The dialog is the PANEL, not the backdrop: a role="dialog" on the
           full-screen overlay would put the click-to-dismiss region inside the
           dialog's own accessible boundary. Matches both command palettes. -->
      <div
        ref="panel"
        class="ksh-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ksh-title"
      >
        <header class="ksh-head">
          <h2 id="ksh-title" class="ksh-title">Keyboard shortcuts</h2>
          <button class="ksh-close" type="button" aria-label="Close" @click="emit('close')">
            <span class="ksh-esc">Esc</span>
          </button>
        </header>
        <!-- tabindex="-1": this scroller overflows, and Chromium makes an
             overflowing container focusable on its own. Without this it is a tab
             stop the focus trap cannot see (no tabindex attribute → no
             `focusableWithin` match), which is exactly how Tab escaped both
             palettes before #93 / #94. -->
        <div class="ksh-body" tabindex="-1">
          <section v-for="group in groups" :key="group.name" class="ksh-group">
            <h3 class="ksh-group-name">{{ group.name }}</h3>
            <ul class="ksh-list">
              <li v-for="item in group.items" :key="item.label" class="ksh-row">
                <span class="ksh-label">{{ item.label }}</span>
                <span class="ksh-keys">
                  <template v-for="(k, i) in item.keys" :key="i">
                    <kbd class="ksh-kbd">{{ k }}</kbd>
                    <span v-if="i < item.keys.length - 1" class="ksh-plus">+</span>
                  </template>
                </span>
              </li>
            </ul>
          </section>
        </div>
        <footer class="ksh-foot">
          <span>Press <kbd class="ksh-kbd">?</kbd> anytime to toggle this panel</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch, onBeforeUnmount } from 'vue'
import { useModalDialog } from '~/admin/composables/useModalDialog'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

// Escape · the Tab trap · initial focus · focus restoration · the body scroll
// lock all come from the shared contract. Escape is ALSO handled locally below
// (capture phase, stopPropagation) and that stays: it is what keeps the editor's
// global Escape from deselecting the block under the panel. The composable's own
// Escape branch never runs in a browser because that stopPropagation ends the
// event before the bubble-phase window listener.
const panel = ref<HTMLElement | null>(null)
useModalDialog({
  open: toRef(props, 'open'),
  dialog: panel,
  onClose: () => emit('close'),
  initialFocus: () => panel.value?.querySelector<HTMLElement>('.ksh-close'),
})

// OS-aware modifier glyph so Mac users see the familiar Command symbol.
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
const mod = isMac ? '⌘' : 'Ctrl'

interface Shortcut { label: string; keys: string[] }
interface Group { name: string; items: Shortcut[] }

// Single source of truth mirroring the real editor bindings:
//  - Command palette / Accessibility panel: AdminCommandPalette.vue + AccessibilityPanel.vue
//  - History + block clipboard + delete/deselect: NavigationTree.vue handleKeyDown
const groups = computed<Group[]>(() => [
  {
    name: 'General',
    items: [
      { label: 'Command palette', keys: [mod, 'K'] },
      { label: 'Accessibility panel', keys: [mod, 'Shift', 'A'] },
      { label: 'This shortcut panel', keys: ['?'] },
    ],
  },
  {
    name: 'History',
    items: [
      { label: 'Undo', keys: [mod, 'Z'] },
      { label: 'Redo', keys: [mod, 'Shift', 'Z'] },
    ],
  },
  {
    name: 'Blocks',
    items: [
      { label: 'Duplicate selected block', keys: [mod, 'D'] },
      { label: 'Copy selected block', keys: [mod, 'C'] },
      { label: 'Paste block', keys: [mod, 'V'] },
      { label: 'Delete selected block', keys: ['Delete'] },
      { label: 'Deselect', keys: ['Esc'] },
    ],
  },
])

// Own capture-phase Escape handler while open — closes the panel and stops the
// event so the editor's global Escape (deselect block) doesn't also fire under it.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  }
}
watch(
  () => props.open,
  (isOpen) => {
    if (typeof window === 'undefined') return
    if (isOpen) window.addEventListener('keydown', onKeydown, true)
    else window.removeEventListener('keydown', onKeydown, true)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown, true)
})
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.ksh-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 1100;
  animation: ksh-fade 0.12s ease;
}
.ksh-panel {
  width: 100%;
  max-width: 52rem;
  background: $pure-white;
  border-radius: 0.8rem;
  box-shadow: 0 1.6rem 4.8rem rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: ksh-pop 0.14s cubic-bezier(0.2, 0.9, 0.3, 1.1);
}
.ksh-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.4rem 1.6rem;
  border-bottom: 1px solid $borders-color;
}
.ksh-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: $text-color;
}
.ksh-close {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.ksh-esc {
  font-size: 1.1rem;
  color: $text-light-color;
  border: 1px solid $borders-color;
  border-radius: 0.4rem;
  padding: 0.2rem 0.6rem;
  background: $tree-nav-bg;
}
.ksh-body {
  padding: 0.6rem 1.6rem 1.2rem;
  max-height: 56vh;
  overflow-y: auto;
}
.ksh-group { margin-top: 1.2rem; }
.ksh-group-name {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $text-light-color;
}
.ksh-list { list-style: none; margin: 0; padding: 0; }
.ksh-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}
.ksh-row:last-child { border-bottom: none; }
.ksh-label { font-size: 1.4rem; color: $text-color; }
.ksh-keys { display: inline-flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }
.ksh-kbd {
  font-family: inherit;
  font-size: 1.15rem;
  min-width: 1.8rem;
  text-align: center;
  color: $text-color;
  border: 1px solid $borders-color;
  border-bottom-width: 2px;
  border-radius: 0.4rem;
  padding: 0.15rem 0.5rem;
  background: $tree-nav-bg;
}
.ksh-plus { font-size: 1.1rem; color: $text-light-color; }
.ksh-foot {
  padding: 1rem 1.6rem;
  border-top: 1px solid $borders-color;
  font-size: 1.15rem;
  color: $text-light-color;
}
@keyframes ksh-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ksh-pop {
  from { opacity: 0; transform: translateY(-0.8rem) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
