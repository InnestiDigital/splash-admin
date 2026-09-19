<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="epal-overlay"
      @click.self="close"
    >
      <div
        ref="panelRef"
        class="epal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Editor command palette"
        tabindex="-1"
      >
        <div class="epal-search">
          <span class="material-icons-outlined epal-search-icon" aria-hidden="true">search</span>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="epal-input"
            placeholder="Jump to a page, block, or run an action…"
            aria-label="Search editor commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="epal-list"
            :aria-activedescendant="activeId"
            autocomplete="off"
            spellcheck="false"
            @keydown="onInputKeydown"
          />
          <kbd class="epal-esc">esc</kbd>
        </div>

        <!-- `tabindex="-1"` is load-bearing, not decoration: Chromium makes an
             overflowing scroll container focusable on its own, so Tab landed on
             this <ul> — which `focusableWithin` does not match, so the trap saw
             focus on neither the first nor the last control and let the NEXT Tab
             walk out into the editor. Options are driven by aria-activedescendant
             from the input, so the list is not meant to be a tab stop anyway. -->
        <ul
          v-if="filtered.length"
          id="epal-list"
          ref="listRef"
          class="epal-list"
          role="listbox"
          tabindex="-1"
        >
          <template v-for="(group, gi) in groupedFiltered" :key="group.name">
            <li class="epal-group" :class="{ 'epal-group--first': gi === 0 }" role="presentation">
              {{ group.name }}
            </li>
            <li
              v-for="cmd in group.items"
              :id="`epal-opt-${cmd.flatIndex}`"
              :key="cmd.id"
              class="epal-opt"
              :class="{ 'epal-opt--active': cmd.flatIndex === selectedIndex }"
              role="option"
              :aria-selected="cmd.flatIndex === selectedIndex"
              @mousemove="selectedIndex = cmd.flatIndex"
              @click="run(cmd)"
            >
              <span class="material-icons-outlined epal-opt-icon" aria-hidden="true">{{ cmd.icon }}</span>
              <span class="epal-opt-label">{{ cmd.label }}</span>
              <span v-if="cmd.secondary" class="epal-opt-hint">{{ cmd.secondary }}</span>
            </li>
          </template>
        </ul>

        <div v-else class="epal-empty">
          No matches for "<strong>{{ query }}</strong>"
        </div>

        <div class="epal-footer">
          <span><kbd>Up</kbd><kbd>Dn</kbd> navigate</span>
          <span><kbd>Enter</kbd> select</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useAccessibilityAudit } from '~/admin/composables/useAccessibilityAudit'
import { useModalDialog } from '~/admin/composables/useModalDialog'
import { getLocalizedLabel, getSchemaLabel } from '~/admin/utils/labelUtils'
import { EDITOR_WRITE_LOCK_KEY } from '~/admin/components/editor/editorWriteLock'

interface Command {
  id: string
  label: string
  icon: string
  group: string
  secondary?: string
  run: () => void | Promise<void>
}

const editorWriteLocked = inject(EDITOR_WRITE_LOCK_KEY, computed(() => false))

interface FlatCommand extends Command {
  flatIndex: number
}

const store = useEditorStore()
const audit = useAccessibilityAudit()

// LOCAL open state — deliberately NOT useCommandPalette(), so this editor-scoped
// palette stays independent of the global admin palette (AdminCommandPalette.vue).
const isOpen = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

function close() {
  isOpen.value = false
}

// The Tab trap, initial + restored focus and the body scroll lock. Escape is
// handled by the capture-phase listener below instead — it must ALSO
// stopPropagation so a close does not reach NavigationTree's window handler
// (global Escape = deselect) underneath, which the composable does not do. That
// same stopPropagation means the composable's own Escape branch never fires, so
// there is no double close.
useModalDialog({
  open: isOpen,
  dialog: panelRef,
  onClose: close,
  initialFocus: () => inputRef.value,
})

/**
 * Humanize a block type as NavigationTree's local getBlockLabel does
 * (that helper is not exported, so replicate its ~6-line fallback).
 */
function blockLabel(block: { type?: string }): string {
  const label = getSchemaLabel(store.schemas[block.type ?? ''] || null)
  if (label) return label
  if (block.type) {
    return block.type
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
  }
  return 'Unknown Block'
}

/** PAGES — flush pending edits and switch through the guarded page-transition API. */
function buildPageCommands(): Command[] {
  return store.pages.map((page) => ({
    id: `page-${page.id}`,
    label: getLocalizedLabel(page.title) || page.slug,
    icon: 'description',
    group: 'Pages',
    secondary: page.slug,
    run: async () => {
      await store.switchPage(page.id)
    },
  }))
}

/** BLOCKS (current page) — select + reveal via the identical NavigationTree row path. */
function buildBlockCommands(): Command[] {
  return store.blocks.map((block) => ({
    id: `block-${block.id}`,
    label: blockLabel(block),
    icon: 'widgets',
    group: 'Blocks',
    secondary: block.type,
      run: async () => { await store.selectBlock(block.id) },
  }))
}

/** ACTIONS — only operations with a real existing store/composable target. */
function buildActionCommands(): Command[] {
  const out: Command[] = []

  if (store.canUndoBlocks) {
    out.push({
      id: 'action-undo',
      label: 'Undo',
      icon: 'undo',
      group: 'Actions',
      secondary: '⌘Z',
      run: async () => { await store.undoBlockChange() },
    })
  }

  if (store.canRedoBlocks) {
    out.push({
      id: 'action-redo',
      label: 'Redo',
      icon: 'redo',
      group: 'Actions',
      secondary: '⌘⇧Z',
      run: async () => { await store.redoBlockChange() },
    })
  }

  out.push({
    id: 'action-a11y',
    label: 'Open accessibility panel',
    icon: 'accessibility_new',
    group: 'Actions',
    secondary: '⌘⇧A',
    run: () => audit.open(),
  })

  out.push({
    id: 'action-theme-settings',
    label: 'Open theme settings',
    icon: 'palette',
    group: 'Actions',
    run: async () => { await store.selectThemeSettings() },
  })

  if (store.currentPage) {
    out.push({
      id: 'action-page-settings',
      label: 'Open page settings',
      icon: 'tune',
      group: 'Actions',
      run: async () => { await store.selectPageSettings() },
    })
  }

  out.push({
    id: 'action-deselect',
    label: 'Deselect / close block',
    icon: 'close',
    group: 'Actions',
    run: async () => { await store.deselectAll() },
  })

  return out
}

const commands = computed<Command[]>(() => {
  // Recompute whenever the palette opens so labels + enabled-state (undo/redo,
  // current page) are fresh. Touch isOpen to register the dependency.
  void isOpen.value
  return [...buildPageCommands(), ...buildBlockCommands(), ...buildActionCommands()]
})

function matches(cmd: Command, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = `${cmd.label} ${cmd.id} ${cmd.secondary ?? ''}`.toLowerCase()
  return hay.includes(needle)
}

const filtered = computed<FlatCommand[]>(() =>
  commands.value
    .filter((c) => matches(c, query.value))
    .map((c, i) => ({ ...c, flatIndex: i })),
)

const groupedFiltered = computed(() => {
  const groups: { name: string; items: FlatCommand[] }[] = []
  for (const cmd of filtered.value) {
    let g = groups.find((x) => x.name === cmd.group)
    if (!g) {
      g = { name: cmd.group, items: [] }
      groups.push(g)
    }
    g.items.push(cmd)
  }
  return groups
})

const activeId = computed(() =>
  filtered.value.length ? `epal-opt-${selectedIndex.value}` : undefined,
)

watch(query, () => {
  selectedIndex.value = 0
})

// Reset only — `useModalDialog`'s `initialFocus` owns moving focus to the input.
watch(isOpen, (openNow) => {
  if (openNow) {
    query.value = ''
    selectedIndex.value = 0
  }
})

function move(delta: number) {
  const n = filtered.value.length
  if (!n) return
  selectedIndex.value = (selectedIndex.value + delta + n) % n
  nextTick(() => {
    listRef.value
      ?.querySelector(`#epal-opt-${selectedIndex.value}`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

async function run(cmd: Command) {
  if (editorWriteLocked.value) return
  close()
  await cmd.run()
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filtered.value[selectedIndex.value]
    if (cmd) run(cmd)
  } else if (e.key === 'Escape') {
    // Handled by the capture-phase global listener too, but keep the input's own
    // handler for parity / when focus never leaves the input.
    e.preventDefault()
    close()
  }
}

// Capture-phase global listener (mirrors KeyboardShortcutsOverlay.vue). stopPropagation
// on the handled keys prevents Ctrl/Cmd+K and Escape from leaking into NavigationTree's
// non-capture window handlers (global Escape = deselect) underneath the palette.
function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    if (editorWriteLocked.value) return
    e.preventDefault()
    e.stopPropagation()
    isOpen.value = !isOpen.value
  } else if (e.key === 'Escape' && isOpen.value) {
    e.preventDefault()
    e.stopPropagation()
    isOpen.value = false
  }
}

watch(editorWriteLocked, (locked) => {
  if (locked) isOpen.value = false
})

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onGlobalKeydown, true)
  }
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onGlobalKeydown, true)
  }
})
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.epal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  // Above AdminCommandPalette + KeyboardShortcutsOverlay (both 1100) and the
  // editor's '?' shortcuts overlay, so this palette always renders on top.
  z-index: 1200;
  animation: epal-fade 0.12s ease;
}

.epal-panel {
  width: 100%;
  max-width: 56rem;
  background: $pure-white;
  border-radius: 0.8rem;
  box-shadow: 0 1.6rem 4.8rem rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: epal-pop 0.14s cubic-bezier(0.2, 0.9, 0.3, 1.1);
}

.epal-search {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.4rem 1.6rem;
  border-bottom: 1px solid $borders-color;
}

.epal-search-icon {
  font-size: 2rem;
  color: $nav-icon-color;
}

.epal-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 1.6rem;
  color: $text-color;
  background: transparent;

  &::placeholder {
    color: $text-light-color;
  }
}

.epal-esc {
  font-size: 1.1rem;
  color: $text-light-color;
  border: 1px solid $borders-color;
  border-radius: 0.4rem;
  padding: 0.2rem 0.6rem;
  background: $tree-nav-bg;
}

.epal-list {
  list-style: none;
  margin: 0;
  padding: 0.6rem;
  max-height: 42vh;
  overflow-y: auto;
}

.epal-group {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $text-light-color;
  padding: 1rem 1rem 0.4rem;

  &--first {
    padding-top: 0.4rem;
  }
}

.epal-opt {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  padding: 0.9rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  color: $text-color;

  &--active {
    background: $alert-success-background;

    .epal-opt-icon {
      color: $primary-color;
    }
  }
}

.epal-opt-icon {
  font-size: 1.9rem;
  color: $nav-icon-color;
  flex-shrink: 0;
}

.epal-opt-label {
  font-size: 1.4rem;
  flex: 1;
}

.epal-opt-hint {
  font-size: 1.15rem;
  color: $text-light-color;
}

.epal-empty {
  padding: 2.4rem 1.6rem;
  font-size: 1.4rem;
  color: $text-light-color;
  text-align: center;
}

.epal-footer {
  display: flex;
  gap: 1.6rem;
  padding: 0.9rem 1.6rem;
  border-top: 1px solid $borders-color;
  background: $tree-nav-bg;
  font-size: 1.1rem;
  color: $text-light-color;

  kbd {
    font-family: inherit;
    border: 1px solid $borders-color;
    border-radius: 0.3rem;
    padding: 0.1rem 0.45rem;
    margin-right: 0.2rem;
    background: $pure-white;
  }
}

@keyframes epal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes epal-pop {
  from { opacity: 0; transform: translateY(-0.8rem) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .epal-overlay,
  .epal-panel {
    animation: none;
  }
}
</style>
