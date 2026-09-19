<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="cmdk-overlay"
      @click.self="close"
    >
      <div
        ref="panelRef"
        class="cmdk-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('admin.command.title', 'Command palette')"
      >
        <div class="cmdk-search">
          <span class="material-icons-outlined cmdk-search-icon" aria-hidden="true">search</span>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="cmdk-input"
            :placeholder="t('admin.command.placeholder', 'Jump to a page or run an action…')"
            :aria-label="t('admin.command.search', 'Search commands')"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            :aria-activedescendant="activeId"
            autocomplete="off"
            spellcheck="false"
            @keydown="onInputKeydown"
          />
          <kbd class="cmdk-esc">esc</kbd>
        </div>

        <ul
          v-if="filtered.length"
          id="cmdk-list"
          ref="listRef"
          class="cmdk-list"
          role="listbox"
          tabindex="-1"
        >
          <template v-for="(group, gi) in groupedFiltered" :key="group.name">
            <li class="cmdk-group" :class="{ 'cmdk-group--first': gi === 0 }" role="presentation">
              {{ group.name }}
            </li>
            <li
              v-for="cmd in group.items"
              :id="`cmdk-opt-${cmd.flatIndex}`"
              :key="cmd.id"
              class="cmdk-opt"
              :class="{ 'cmdk-opt--active': cmd.flatIndex === selectedIndex }"
              role="option"
              :aria-selected="cmd.flatIndex === selectedIndex"
              @mousemove="selectedIndex = cmd.flatIndex"
              @click="run(cmd)"
            >
              <span class="material-icons-outlined cmdk-opt-icon" aria-hidden="true">{{ cmd.icon }}</span>
              <span class="cmdk-opt-label">{{ cmd.label }}</span>
              <span v-if="cmd.hint" class="cmdk-opt-hint">{{ cmd.hint }}</span>
            </li>
          </template>
        </ul>

        <div v-else class="cmdk-empty">
          {{ t('admin.command.noMatches', `No matches for “${query}”`, { query }) }}
        </div>

        <div class="cmdk-footer">
          <span><kbd>Up</kbd><kbd>Dn</kbd> navigate</span>
          <span><kbd>Enter</kbd> select</span>
          <span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useCommandPalette } from '~/admin/composables/useCommandPalette'
import { useModalDialog } from '~/admin/composables/useModalDialog'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useAuthStore } from '~/admin/stores/authStore'
import { useNavStore } from '~/admin/stores/navStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminNavLabel, type NavItem, visibleNavForRole } from '~/admin/config/navigation'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAssistantStore } from '~/admin/stores/assistantStore'

interface Command {
  id: string
  label: string
  icon: string
  group: string
  hint?: string
  keywords?: string
  run: () => void | Promise<void>
}

const { isOpen, open, close, toggle } = useCommandPalette()
const { adminUrl } = useAdminUrl()
const authStore = useAuthStore()
const navStore = useNavStore()
const programStore = useProgramStore()
const siteStore = useSiteStore()
const assistantStore = useAssistantStore()
const { t } = useAdminI18n()

const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

const hasContext = computed(() => !!programStore.activeProgramId && !!siteStore.activeSiteId)

/** Resolve a nav item's `to` suffix into a full admin path. */
function resolvePath(item: NavItem): string {
  return item.contextFree ? `/admin${item.to}` : adminUrl(item.to as string)
}

/** Flatten the role-filtered nav tree into navigate commands. */
function buildNavCommands(): Command[] {
  const tree = visibleNavForRole(authStore.user?.role)
  const out: Command[] = []

  const walk = (items: NavItem[], parent?: NavItem) => {
    for (const item of items) {
      if (item.children?.length) {
        walk(item.children, item)
        continue
      }
      if (!item.to) continue
      // Site-scoped destinations only make sense with an active program + site;
      // adminUrl() would otherwise emit a context-less, 404-bound path.
      if (!item.contextFree && !hasContext.value) continue
      out.push({
        id: `nav-${item.id}`,
        label: adminNavLabel(item, t),
        icon: item.icon,
        group: t('admin.command.navigate', 'Navigate'),
        hint: parent ? adminNavLabel(parent, t) : undefined,
        keywords: parent ? adminNavLabel(parent, t) : undefined,
        run: () => navigateTo(resolvePath(item)),
      })
    }
  }
  walk(tree)
  return out
}

/** Action commands — non-destructive editor / UI operations. */
function buildActionCommands(): Command[] {
  const role = authStore.user?.role
  const out: Command[] = []

  if (hasContext.value && role === 'admin') {
    out.push({
      id: 'action-editor',
      label: t('admin.command.openEditor', 'Open site editor'),
      icon: 'edit_note',
      group: t('admin.command.actions', 'Actions'),
      keywords: 'edit blocks layout',
      run: () => navigateTo(adminUrl('/editor')),
    })
  }

  out.push({
    id: 'action-toggle-sidebar',
    label: navStore.menuCollapsed ? t('admin.command.expandSidebar', 'Expand sidebar') : t('admin.command.collapseSidebar', 'Collapse sidebar'),
    icon: navStore.menuCollapsed ? 'chevron_right' : 'chevron_left',
    group: t('admin.command.actions', 'Actions'),
    keywords: 'menu nav toggle',
    run: () => navStore.toggleMenu(),
  })

  if (assistantStore.enabled) {
    out.push({
      id: 'action-open-assistant',
      label: t('admin.command.openAssistant', 'Open assistant'),
      icon: 'smart_toy',
      group: t('admin.command.actions', 'Actions'),
      keywords: 'chat help ai',
      run: () => assistantStore.toggle(),
    })
  }

  out.push({
    id: 'action-signout',
    label: t('admin.shell.signOut', 'Sign out'),
    icon: 'logout',
    group: t('admin.command.actions', 'Actions'),
    keywords: 'logout exit',
    run: async () => {
      await authStore.logout()
      await navigateTo('/admin/login')
    },
  })

  return out
}

const commands = computed<Command[]>(() => {
  // Recompute whenever the palette opens so labels (e.g. sidebar state) + context
  // are fresh. Touch isOpen to register the dependency.
  void isOpen.value
  return [...buildNavCommands(), ...buildActionCommands()]
})

/** Lightweight fuzzy match: every whitespace token must be a substring, OR the
 * query is an in-order subsequence of the haystack (fast-typing tolerance). */
function matches(cmd: Command, q: string): boolean {
  if (!q) return true
  const hay = `${cmd.label} ${cmd.hint ?? ''} ${cmd.keywords ?? ''} ${cmd.group}`.toLowerCase()
  const needle = q.toLowerCase().trim()
  if (needle.split(/\s+/).every(t => hay.includes(t))) return true
  let i = 0
  for (const ch of hay) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

interface FlatCommand extends Command {
  flatIndex: number
}

const filtered = computed<FlatCommand[]>(() => {
  const q = query.value
  return commands.value
    .filter(c => matches(c, q))
    .map((c, i) => ({ ...c, flatIndex: i }))
})

const groupedFiltered = computed(() => {
  const groups: { name: string; items: FlatCommand[] }[] = []
  for (const cmd of filtered.value) {
    let g = groups.find(x => x.name === cmd.group)
    if (!g) {
      g = { name: cmd.group, items: [] }
      groups.push(g)
    }
    g.items.push(cmd)
  }
  return groups
})

const activeId = computed(() =>
  filtered.value.length ? `cmdk-opt-${selectedIndex.value}` : undefined,
)

watch(query, () => {
  selectedIndex.value = 0
})

watch(isOpen, (openNow) => {
  if (openNow) {
    query.value = ''
    selectedIndex.value = 0
  }
})

// The full dialog contract — Escape, the Tab trap, initial + restored focus and
// the body scroll lock. `isOpen` is a `readonly()` module singleton, so mirror it
// through a computed to hand the composable a plain readable ref.
useModalDialog({
  open: computed(() => isOpen.value),
  dialog: panelRef,
  onClose: close,
  initialFocus: () => inputRef.value,
})

function move(delta: number) {
  const n = filtered.value.length
  if (!n) return
  selectedIndex.value = (selectedIndex.value + delta + n) % n
  nextTick(() => {
    listRef.value
      ?.querySelector(`#cmdk-opt-${selectedIndex.value}`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

async function run(cmd: Command) {
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
  }
  // Escape is NOT handled here: useModalDialog owns it, and only for the
  // most-recently-opened dialog. Closing here too would fire close() twice and,
  // worse, would keep closing the palette when a dialog opened OVER it should.
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (typeof e.key === 'string' && e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    toggle()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

defineExpose({ open })
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.cmdk-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  z-index: 1100;
  animation: cmdk-fade 0.12s ease;
}

.cmdk-panel {
  width: 100%;
  max-width: 56rem;
  background: $pure-white;
  border-radius: 0.8rem;
  box-shadow: 0 1.6rem 4.8rem rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: cmdk-pop 0.14s cubic-bezier(0.2, 0.9, 0.3, 1.1);
}

.cmdk-search {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.4rem 1.6rem;
  border-bottom: 1px solid $borders-color;
}

.cmdk-search-icon {
  font-size: 2rem;
  color: $nav-icon-color;
}

.cmdk-input {
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

.cmdk-esc {
  font-size: 1.1rem;
  color: $text-light-color;
  border: 1px solid $borders-color;
  border-radius: 0.4rem;
  padding: 0.2rem 0.6rem;
  background: $tree-nav-bg;
}

.cmdk-list {
  list-style: none;
  margin: 0;
  padding: 0.6rem;
  max-height: 42vh;
  overflow-y: auto;
}

.cmdk-group {
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

.cmdk-opt {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  padding: 0.9rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  color: $text-color;

  &--active {
    background: $alert-success-background;

    .cmdk-opt-icon {
      color: $primary-color;
    }
  }
}

.cmdk-opt-icon {
  font-size: 1.9rem;
  color: $nav-icon-color;
  flex-shrink: 0;
}

.cmdk-opt-label {
  font-size: 1.4rem;
  flex: 1;
}

.cmdk-opt-hint {
  font-size: 1.15rem;
  color: $text-light-color;
}

.cmdk-empty {
  padding: 2.4rem 1.6rem;
  font-size: 1.4rem;
  color: $text-light-color;
  text-align: center;
}

.cmdk-footer {
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

@keyframes cmdk-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes cmdk-pop {
  from { opacity: 0; transform: translateY(-0.8rem) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .cmdk-overlay,
  .cmdk-panel {
    animation: none;
  }
}
</style>
