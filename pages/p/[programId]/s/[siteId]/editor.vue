<template>
  <div class="editor">
    <!-- Top Bar -->
    <div class="editor__topbar">
      <!-- Home ('/') is the only destination every editor-capable role may
           reach; '/site' is the admin-only legacy overview and stranded
           editors on the Access denied screen. -->
      <NuxtLink
        :to="adminUrl('/')"
        class="editor__back"
        :aria-disabled="changeNavigationPending"
        @click.prevent="safeNavigate(adminUrl('/'))"
      >
        <span class="material-icons-outlined" aria-hidden="true">arrow_back</span>
        Exit editor
      </NuxtLink>
      <span class="editor__topbar-divider" aria-hidden="true" />
      <span class="editor__title">{{ t('admin.nav.siteEditor', 'Site editor') }}</span>
      <span class="editor__scope">
        <span>Editing: {{ siteStore.activeSiteName || 'No site' }}</span>
      </span>
      <MotionBudgetPill :scenes="store.scenes" />
      <button
        type="button"
        class="editor__a11y-pill"
        :class="{
          'editor__a11y-pill--error': audit.errorCount.value > 0,
          'editor__a11y-pill--warn': audit.errorCount.value === 0 && audit.warningCount.value > 0,
        }"
        :aria-label="a11yAriaLabel"
        :title="a11yTitle"
        @click="audit.open()"
      >
        <span class="material-icons-outlined" aria-hidden="true">accessibility_new</span>
        <span v-if="a11yTotal">{{ a11yTotal > 99 ? '99+' : a11yTotal }}</span>
        <span v-else>{{ t('admin.editor.accessibility', 'Accessibility') }}</span>
      </button>
      <EditorSaveStatus />
      <button
        v-if="assistantStore.enabled"
        type="button"
        class="editor__assistant-pill"
        :aria-pressed="assistantStore.open"
        :aria-label="t('admin.shell.openAssistant', 'Open assistant')"
        :title="t('admin.shell.openAssistant', 'Open assistant')"
        @click="assistantStore.toggle()"
      >
        <span class="material-icons-outlined" aria-hidden="true">smart_toy</span>
        <span>{{ t('admin.editor.assistant', 'Assistant') }}</span>
      </button>
      <!-- Publish page + API are admin-only (rbac ADMIN_ONLY_PATTERNS). -->
      <NuxtLink
        v-if="authStore.isAdmin"
        :to="adminUrl('/publish')"
        class="editor__publish"
        :aria-disabled="changeNavigationPending"
        @click.prevent="safeNavigate(adminUrl('/publish'))"
      >
        Publish
      </NuxtLink>
    </div>

    <!-- Accessibility audit overlay (⌘⇧A) -->
    <AccessibilityPanel />

    <!-- Editor command palette (⌘K / Ctrl+K) -->
    <CommandPalette />

    <!-- Three-panel layout + bottom drawer -->
    <div
      class="editor__body"
      :inert="editorWriteLocked || undefined"
      :aria-busy="editorWriteLocked || undefined"
    >
      <!-- Top row: sidebar + preview + settings -->
      <div class="editor__top-row">
        <!-- Left sidebar: page and section structure -->
        <div class="editor__sidebar" :style="{ width: sidebarWidth + 'px' }">
          <NavigationTree />
        </div>

        <!-- Resize handle: sidebar | preview -->
        <div
          class="editor__resize-handle"
          role="separator"
          aria-orientation="vertical"
          tabindex="0"
          :aria-valuenow="sidebarWidth"
          :aria-valuemin="MIN_SIDEBAR"
          :aria-valuemax="MAX_SIDEBAR"
          aria-label="Resize sidebar"
          @mousedown="startResize('sidebar', $event)"
          @dblclick="resetPanel('sidebar')"
          @keydown="onResizeKeydown('sidebar', $event)"
        ></div>

        <!-- Center: Preview (gate rendering until siteStore has data to avoid empty ?site= param) -->
        <div class="editor__preview" :class="{ 'editor__preview--resizing': isResizing }">
          <PreviewPanel v-if="siteStore.hasSite" />
        </div>

        <!-- Resize handle: preview | settings -->
        <div
          class="editor__resize-handle"
          role="separator"
          aria-orientation="vertical"
          tabindex="0"
          :aria-valuenow="settingsWidth"
          :aria-valuemin="MIN_SETTINGS"
          :aria-valuemax="MAX_SETTINGS"
          aria-label="Resize settings panel"
          @mousedown="startResize('settings', $event)"
          @dblclick="resetPanel('settings')"
          @keydown="onResizeKeydown('settings', $event)"
        ></div>

        <!-- Right sidebar: Settings -->
        <div
          class="editor__settings"
          :class="{
            'editor__settings--active': inspectorOpen,
            'editor__settings--theme': store.showThemeSettings,
          }"
          :style="{ width: settingsWidth + 'px' }"
        >
          <ThemeSettingsPanel
            v-if="store.showThemeSettings"
          />
          <SettingsPanel
            v-else
            @open-timeline="toggleTimeline"
            @page-mutation-busy="pageMutationBusy = $event"
          />
        </div>
      </div>

      <!-- Bottom drawer: Timeline Editor -->
      <div v-if="timelineOpen" class="editor__bottom-drawer" :style="{ height: timelineHeight + 'px' }">
        <div
          class="editor__resize-handle--horizontal"
          role="separator"
          aria-orientation="horizontal"
          tabindex="0"
          :aria-valuenow="timelineHeight"
          :aria-valuemin="MIN_TIMELINE"
          :aria-valuemax="MAX_TIMELINE"
          aria-label="Resize timeline"
          @mousedown="startResize('timeline', $event)"
          @dblclick="resetPanel('timeline')"
          @keydown="onResizeKeydown('timeline', $event)"
        ></div>
        <div class="editor__timeline-header">
          <span class="editor__timeline-title">{{ t('admin.editor.timeline', 'Timeline') }}</span>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary editor__timeline-close"
            @click="toggleTimeline"
          >
            &times;
          </button>
        </div>
        <div class="editor__timeline-body">
          <TimelineEditor
            :scenes="store.scenes"
            :selected-scene-id="store.selectedSceneId ?? undefined"
            :selected-entry-id="store.selectedEntryId ?? undefined"
            :pixels-per-ms="timelineZoom"
            @select-scene="onTimelineSelectScene"
            @select-entry="onTimelineSelectEntry"
            @scrub-scene="onTimelineSceneScrub"
            @update:pixels-per-ms="timelineZoom = $event"
            @update-entry-easing="onUpdateEntryEasing"
            @update-entry-keyframes="onUpdateEntryKeyframes"
            @update-conditions="onUpdateSceneConditions"
          />
        </div>
      </div>
    </div>

    <div v-if="pageMutationBusy" class="editor__write-lock-status" role="status" aria-live="polite">
      Publishing the latest page… editing is paused briefly.
    </div>

    <!-- Timeline toggle button (visible when drawer is closed) -->
    <button
      v-if="!timelineOpen && store.scenes.length > 0"
      type="button"
      class="editor__timeline-toggle"
      @click="toggleTimeline"
    >
      {{ t('admin.editor.timeline', 'Timeline') }} ({{ store.scenes.length }})
    </button>

    <!-- No site overlay (only after store has initialized) -->
    <div v-if="siteStore.initialized && !siteStore.hasSite" class="editor__loading">
      <p>No site configured. Set up your site to open the editor.</p>
      <NuxtLink to="/admin/new" class="editor__retry-btn">Set Up Your Site</NuxtLink>
    </div>

    <!-- Loading overlay -->
    <div v-else-if="initialLoading || store.loading" class="editor__loading">
      <div class="editor__spinner" />
      <p>{{ t('admin.editor.loading', 'Loading editor...') }}</p>
    </div>

    <!-- Error overlay -->
    <div v-if="store.error && !store.loading" class="editor__error">
      <p>{{ store.error }}</p>
      <button @click="initialize">{{ t('admin.shell.retry', 'Retry') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, provide } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import {
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useAuthStore } from '~/admin/stores/authStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { useAlertStore } from '~/admin/stores/alertStore'
import { useAssistantEditorOpsStore } from '~/admin/stores/assistantEditorOpsStore'
import { useAssistantStore } from '~/admin/stores/assistantStore'
import { useAdminContext } from '~/admin/composables/useAdminContext'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { navigationItems } from '~/admin/config/navigation'
import { isNavRouteAllowed } from '~/admin/utils/isNavRouteAllowed'
import { useAdminTypographyStyles } from '~/admin/composables/useAdminTypographyStyles'
import NavigationTree from '~/admin/components/editor/NavigationTree.vue'
import ThemeSettingsPanel from '~/admin/components/editor/ThemeSettingsPanel.vue'
import SettingsPanel from '~/admin/components/editor/SettingsPanel.vue'
import PreviewPanel from '~/admin/components/editor/PreviewPanel.vue'
import TimelineEditor from '~/admin/components/animation/TimelineEditor.vue'
import MotionBudgetPill from '~/admin/components/animation/MotionBudgetPill.vue'
import AccessibilityPanel from '~/admin/components/editor/AccessibilityPanel.vue'
import CommandPalette from '~/admin/components/editor/CommandPalette.vue'
import EditorSaveStatus from '~/admin/components/editor/EditorSaveStatus.vue'
import { useAccessibilityAudit } from '~/admin/composables/useAccessibilityAudit'
import { useEditorChangeGuard } from '~/admin/composables/useEditorChangeGuard'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'
import { EDITOR_WRITE_LOCK_KEY } from '~/admin/components/editor/editorWriteLock'

definePageMeta({ layout: 'admin-editor' })

const { t } = useAdminI18n()

const siteStore = useSiteStore()
const authStore = useAuthStore()
const programStore = useProgramStore()
const alertStore = useAlertStore()
const assistantEditorOps = useAssistantEditorOpsStore()
const assistantStore = useAssistantStore()
const store = useEditorStore()
const changeStore = useEditorChangeStore()
const pageMutationBusy = ref(false)
const pageScopeBarrierBusy = computed(() => {
  const pageId = store.currentPage?.id
  if (!pageId) return false
  const scope = editorChangeScope.page(pageId)
  return changeStore.operationList.some(operation => (
    operation.scope === scope && operation.barrier
  ))
})
const editorWriteLocked = computed(() => pageMutationBusy.value || pageScopeBarrierBusy.value)
provide(EDITOR_WRITE_LOCK_KEY, editorWriteLocked)
const { sendSceneScrub } = useCmsPreview()
const { syncFromRoute, isSelfScopedRole } = useAdminContext()
const { adminUrl } = useAdminUrl()
const route = useRoute()
const router = useRouter()
const {
  navigating: changeNavigationPending,
  safeNavigate,
} = useEditorChangeGuard()

const audit = useAccessibilityAudit()
const a11yTotal = computed(() => audit.errorCount.value + audit.warningCount.value)
const a11yTitle = computed(() =>
  a11yTotal.value
    ? `Accessibility: ${audit.errorCount.value} error(s), ${audit.warningCount.value} warning(s)  (⌘⇧A)`
    : 'Accessibility audit — no issues  (⌘⇧A)',
)
const a11yAriaLabel = computed(
  () => `Open accessibility audit — ${a11yTotal.value} issue(s) on this page`,
)

// Inject typography preset CSS (`.rt-preset-{key}` classes + `--rt-preset-*` vars)
// so TipTap editor selections render with their actual typography styles.
useAdminTypographyStyles()

const initialLoading = ref(true)
const inspectorOpen = computed(() =>
  store.editorMode.type !== 'none' || store.showSectionSettings,
)

// Keep global theme mode deep-linkable from the admin navigation and browser
// history. Other editor selections remove the query rather than leaving a
// stale URL that claims Theme Settings is still active.
function syncThemeModeFromRoute(mode: unknown) {
  const routeWantsTheme = mode === 'theme'
  if (routeWantsTheme && !store.showThemeSettings) {
    store.selectThemeSettings()
  } else if (!routeWantsTheme && store.showThemeSettings) {
    store.deselectAll()
  }
}

watch(
  () => route.query.mode,
  syncThemeModeFromRoute,
  { immediate: true },
)

watch(
  () => store.showThemeSettings,
  (showThemeSettings) => {
    // Page hydration clears page-bound selection during initialization. Do not let
    // that transient state erase an intentional ?mode=theme deep link.
    if (initialLoading.value) return

    const routeHasTheme = route.query.mode === 'theme'
    if (showThemeSettings === routeHasTheme) return

    const query = { ...route.query }
    if (showThemeSettings) {
      query.mode = 'theme'
    } else {
      delete query.mode
    }
    void router.replace({ query })
  },
)

// Resizable panels
const STORAGE_KEY = 'editor-panel-widths'
const TIMELINE_STORAGE_KEY = 'editor-timeline-state'
const MIN_SIDEBAR = 200
const MAX_SIDEBAR = 480
const MIN_SETTINGS = 320
const MAX_SETTINGS = 600
const MIN_PREVIEW = 320
const MIN_TIMELINE = 120
const MAX_TIMELINE = 500
const DEFAULT_SIDEBAR = 260
const DEFAULT_SETTINGS = 400
const DEFAULT_TIMELINE = 200
const KEYBOARD_RESIZE_STEP = 20

function loadPanelWidths() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (err) {
    console.warn('[editor] panel widths localStorage corrupt, clearing', err)
    localStorage.removeItem(STORAGE_KEY)
  }
  return { sidebar: DEFAULT_SIDEBAR, settings: DEFAULT_SETTINGS }
}

function loadTimelineState() {
  try {
    const saved = localStorage.getItem(TIMELINE_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (err) {
    console.warn('[editor] timeline state localStorage corrupt, clearing', err)
    localStorage.removeItem(TIMELINE_STORAGE_KEY)
  }
  return { open: false, height: DEFAULT_TIMELINE }
}

const savedWidths = loadPanelWidths()
function normalizeStoredWidth(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

const sidebarWidth = ref(normalizeStoredWidth(savedWidths.sidebar, MIN_SIDEBAR, MAX_SIDEBAR, DEFAULT_SIDEBAR))
const settingsWidth = ref(normalizeStoredWidth(savedWidths.settings, MIN_SETTINGS, MAX_SETTINGS, DEFAULT_SETTINGS))
const isResizing = ref(false)

// Timeline bottom drawer state
const savedTimeline = loadTimelineState()
const timelineOpen = ref(savedTimeline.open)
const timelineHeight = ref(savedTimeline.height)
const timelineZoom = ref(0.5)

function toggleTimeline() {
  timelineOpen.value = !timelineOpen.value
  saveTimelineState()
}

function saveTimelineState() {
  try {
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify({
      open: timelineOpen.value,
      height: timelineHeight.value,
    }))
  } catch {}
}

function savePanelWidths() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sidebar: sidebarWidth.value,
      settings: settingsWidth.value,
    }))
  } catch {}
}

/** Clamp sidebar so preview keeps at least MIN_PREVIEW */
function clampSidebar(width: number): number {
  const available = window.innerWidth - settingsWidth.value - MIN_PREVIEW - 8 // 8 = two 4px handles
  const max = Math.min(MAX_SIDEBAR, available)
  return Math.max(MIN_SIDEBAR, Math.min(max, width))
}

/** Clamp settings so preview keeps at least MIN_PREVIEW */
function clampSettings(width: number): number {
  const available = window.innerWidth - sidebarWidth.value - MIN_PREVIEW - 8
  const max = Math.min(MAX_SETTINGS, available)
  return Math.max(MIN_SETTINGS, Math.min(max, width))
}

// Timeline ↔ block selection syncing
function onTimelineSelectScene(sceneId: string) {
  store.selectScene(sceneId)
  // Auto-select the first entry's target block in the settings panel
  const scene = store.scenes.find(s => s.id === sceneId)
  const firstEntry = scene?.entries[0]
  if (firstEntry) {
    const blockId = firstEntry.target.entityId
    if (blockId && store.blocks.find(b => b.id === blockId)) {
      store.selectBlock(blockId)
    }
  }
}

function onTimelineSelectEntry(entryId: string) {
  store.selectEntry(entryId)
  // Select the entry's target block
  for (const scene of store.scenes) {
    const entry = scene.entries.find(e => e.id === entryId)
    if (entry) {
      const blockId = entry.target.entityId
      if (blockId && store.blocks.find(b => b.id === blockId)) {
        store.selectBlock(blockId)
      }
      break
    }
  }
}

function onTimelineSceneScrub(sceneId: string, progress: number) {
  sendSceneScrub(sceneId, progress)
}

function onUpdateEntryEasing(entryId: string, easing: string) {
  for (const scene of store.scenes) {
    if (scene.entries.some(e => e.id === entryId)) {
      store.updateEntry(scene.id, entryId, { easing })
      break
    }
  }
}

function onUpdateEntryKeyframes(entryId: string, keyframes: any[]) {
  for (const scene of store.scenes) {
    if (scene.entries.some(e => e.id === entryId)) {
      store.updateEntry(scene.id, entryId, { keyframes })
      break
    }
  }
}

function onUpdateSceneConditions(sceneId: string, conditions: any) {
  store.updateScene(sceneId, { conditions })
}

let resizeTarget: 'sidebar' | 'settings' | 'timeline' | null = null
let resizeStartX = 0
let resizeStartY = 0
let resizeStartWidth = 0
let resizeStartHeight = 0
let rafId: number | null = null

function startResize(target: 'sidebar' | 'settings' | 'timeline', event: MouseEvent) {
  resizeTarget = target
  isResizing.value = true
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  if (target === 'timeline') {
    resizeStartHeight = timelineHeight.value
    document.body.style.cursor = 'row-resize'
  } else {
    resizeStartWidth = target === 'sidebar' ? sidebarWidth.value : settingsWidth.value
    document.body.style.cursor = 'col-resize'
  }
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.userSelect = 'none'
}

function onResizeMove(event: MouseEvent) {
  if (!resizeTarget) return
  const target = resizeTarget
  const clientX = event.clientX
  const clientY = event.clientY
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    rafId = null
    if (target === 'timeline') {
      const delta = resizeStartY - clientY
      timelineHeight.value = Math.max(MIN_TIMELINE, Math.min(MAX_TIMELINE, resizeStartHeight + delta))
    } else if (target === 'sidebar') {
      const delta = clientX - resizeStartX
      sidebarWidth.value = clampSidebar(resizeStartWidth + delta)
    } else {
      const delta = clientX - resizeStartX
      settingsWidth.value = clampSettings(resizeStartWidth - delta)
    }
  })
}

function onResizeEnd() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (resizeTarget) {
    if (resizeTarget === 'timeline') {
      saveTimelineState()
    } else {
      savePanelWidths()
    }
  }
  resizeTarget = null
  isResizing.value = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function cleanupResize() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  isResizing.value = false
  resizeTarget = null
}

/** Double-click a handle to reset that panel to its default size */
function resetPanel(target: 'sidebar' | 'settings' | 'timeline') {
  if (target === 'sidebar') {
    sidebarWidth.value = DEFAULT_SIDEBAR
    savePanelWidths()
  } else if (target === 'settings') {
    settingsWidth.value = DEFAULT_SETTINGS
    savePanelWidths()
  } else {
    timelineHeight.value = DEFAULT_TIMELINE
    saveTimelineState()
  }
}

/** Keyboard resize: arrow keys adjust panel size */
function onResizeKeydown(target: 'sidebar' | 'settings' | 'timeline', event: KeyboardEvent) {
  const step = event.shiftKey ? KEYBOARD_RESIZE_STEP * 3 : KEYBOARD_RESIZE_STEP
  let handled = true

  if (target === 'timeline') {
    if (event.key === 'ArrowUp') {
      timelineHeight.value = Math.max(MIN_TIMELINE, Math.min(MAX_TIMELINE, timelineHeight.value + step))
    } else if (event.key === 'ArrowDown') {
      timelineHeight.value = Math.max(MIN_TIMELINE, Math.min(MAX_TIMELINE, timelineHeight.value - step))
    } else if (event.key === 'Home') {
      timelineHeight.value = DEFAULT_TIMELINE
    } else { handled = false }
    if (handled) saveTimelineState()
  } else {
    const grow = target === 'sidebar' ? 'ArrowRight' : 'ArrowLeft'
    const shrink = target === 'sidebar' ? 'ArrowLeft' : 'ArrowRight'
    const clamp = target === 'sidebar' ? clampSidebar : clampSettings
    const ref = target === 'sidebar' ? sidebarWidth : settingsWidth
    const defaultVal = target === 'sidebar' ? DEFAULT_SIDEBAR : DEFAULT_SETTINGS

    if (event.key === grow) {
      ref.value = clamp(ref.value + step)
    } else if (event.key === shrink) {
      ref.value = clamp(ref.value - step)
    } else if (event.key === 'Home') {
      ref.value = defaultVal
    } else { handled = false }
    if (handled) savePanelWidths()
  }

  if (handled) event.preventDefault()
}

// The one signal for "an editor is open" (assistant spec §5.2). Kept out of the
// async bootstrap below: that hook returns early on every redirect path, and a
// flag that only sets on the happy path is a flag the assistant cannot trust.
onMounted(() => assistantEditorOps.setEditorMounted(true))
onUnmounted(() => assistantEditorOps.setEditorMounted(false))

onUnmounted(cleanupResize)

async function initialize() {
  if (!siteStore.hasSite) return
  initialLoading.value = true

  try {
    await Promise.all([
      store.fetchPages(),
      store.fetchSchemas(),
      store.fetchThemeSettings(),
      store.fetchPreviewConfig(),
      store.fetchTypographyPresets(),
      store.fetchTypographyRoles(),
    ])

    // Retry preview config once if initial fetch failed (transient network issue)
    if (!store.initialConfig) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await store.fetchPreviewConfig()
    }

    // `?pageId=` opens one specific page — how the Brand canvases page hands a
    // canvas over to the editor, which is an ordinary page to everything here.
    // A id that is not in this site's list is announced rather than silently
    // swapped for the first page, which would look like the link opened the
    // wrong canvas.
    const requestedPageId = typeof route.query.pageId === 'string' ? route.query.pageId : null
    const requestedPage = requestedPageId
      ? store.pages.find(page => page.id === requestedPageId)
      : undefined

    if (requestedPageId && !requestedPage) {
      alertStore.warning('That page is not in this site.', 'The editor opened the first page instead.')
    }

    const targetPageId = requestedPage?.id ?? store.pages[0]?.id
    if (targetPageId) {
      await store.hydratePage(targetPageId)
    }

    // Load layout settings if layout component types are present
    if (store.layoutComponentTypes.length > 0) {
      await store.fetchAllLayoutSettings()
    }
  } finally {
    initialLoading.value = false
    syncThemeModeFromRoute(route.query.mode)
  }
}

onMounted(async () => {
  // Editor bypasses AdminLayout, so we must initialize auth + site ourselves
  if (!authStore.initialized) {
    await authStore.fetchSession()
  }
  if (!authStore.isAuthenticated) {
    await navigateTo('/admin/login')
    return
  }

  // This page uses the 'admin-editor' layout, so Layout.vue's
  // isNavRouteAllowed gate never runs — replicate it here. The '/editor' nav
  // item grants admin + editor; a viewer or client hand-typing the URL is
  // sent to the home page instead of a workspace whose writes all 403.
  if (isNavRouteAllowed(navigationItems, '/editor', route.query, authStore.user?.role) === false) {
    await navigateTo(adminUrl('/'))
    return
  }

  // Sync stores from route params (programId / siteId)
  const syncResult = await syncFromRoute()
  if (!syncResult.ok) {
    const msg = syncResult.reason === 'no-programs'
      ? 'No programs available.'
      : syncResult.reason === 'program-not-found'
        ? `Program not found: ${syncResult.missingId}`
        : syncResult.reason === 'no-sites'
          ? 'No sites available for this program.'
          : `Site not found: ${syncResult.missingId}`
    alertStore.warning(msg, 'You have been redirected to a known location.')
    const firstProgram = programStore.programs[0]
    await navigateTo(firstProgram ? `/admin/p/${firstProgram.id}/` : '/admin/new')
    return
  }

  // fetchSite() hits admin-only /api/admin/sites. A self-scoped role already
  // holds its sites from adoptOwnContext — never send it to the collection,
  // even if a refactor stops setSites from flipping `initialized`.
  if (!siteStore.initialized && !isSelfScopedRole()) {
    await siteStore.fetchSite()
  }
  if (!siteStore.hasSite) {
    await navigateTo('/admin/new')
    return
  }
  initialize()
})

// Re-initialize when site changes
watch(() => siteStore.activeSiteId, (newId) => {
  if (newId) initialize()
})
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  font-family: var(--cms-font-ui);

  /* These were five hardcoded hexes pinned to the pre-repaint palette, which
     left the editor as the one admin surface that ignored the design tokens.
     They stay as --editor-* names (a lot of scoped rules reference them) but
     now resolve through the global token layer, so the editor repaints with
     the rest of the admin instead of drifting away from it. */
  --editor-accent: var(--cms-accent);
  --editor-accent-soft: var(--cms-accent-soft);
  --editor-text: var(--cms-ink);
  --editor-muted: var(--cms-ink-muted);
  --editor-border: var(--cms-line);
  background: var(--cms-canvas);
}

.editor__topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 60px;
  background: var(--cms-surface);
  border-bottom: 1px solid var(--editor-border);
  box-shadow: 0 1px 0 rgba(33, 30, 25, 0.02);
  flex-shrink: 0;
  position: relative;
  z-index: 30;
}

.editor__back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 8px 0 6px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--editor-muted);
  text-decoration: none;
  transition:
    color var(--cms-motion-fast) var(--cms-ease-out),
    background-color var(--cms-motion-fast) var(--cms-ease-out),
    transform var(--cms-motion-fast) var(--cms-ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .editor__back:hover {
    color: var(--editor-text);
    background: var(--cms-surface-subtle);
  }
}

.editor__back:active {
  transform: scale(0.97);
}

.editor__back .material-icons-outlined {
  font-size: 16px;
}

.editor__topbar-divider {
  width: 1px;
  height: 22px;
  background: var(--editor-border);
}

.editor__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--editor-text);
  letter-spacing: -0.01em;
}

.editor__scope {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--editor-border);
  border-radius: 7px;
  background: var(--cms-surface-subtle);
  color: var(--editor-muted);
  font-size: 12px;
}

.editor__assistant-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--editor-border);
  border-radius: 999px;
  background: var(--cms-surface-subtle);
  color: var(--editor-muted);
  cursor: pointer;
  line-height: 1;
  transition:
    border-color var(--cms-motion-fast) var(--cms-ease-out),
    color var(--cms-motion-fast) var(--cms-ease-out);
}
.editor__assistant-pill:hover,
.editor__assistant-pill[aria-pressed='true'] {
  border-color: var(--cms-line-hover);
  color: var(--cms-ink);
}
.editor__assistant-pill .material-icons-outlined {
  font-size: 16px;
}

.editor__a11y-pill {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--editor-border);
  border-radius: 999px;
  background: var(--cms-surface-subtle);
  color: var(--editor-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
  transition:
    border-color var(--cms-motion-fast) var(--cms-ease-out),
    color var(--cms-motion-fast) var(--cms-ease-out);
}
.editor__a11y-pill:hover {
  border-color: var(--cms-line-hover);
  color: var(--cms-ink);
}
.editor__a11y-pill .material-icons-outlined {
  font-size: 16px;
}
/* Was a Tailwind amber/red set (var(--cms-warn-soft)…#b91c1c) that belonged to no palette
   in this codebase — now the same warn/danger roles every other surface uses. */
.editor__a11y-pill--warn {
  background: var(--cms-warn-soft);
  border-color: var(--cms-warn);
  color: var(--cms-warn);
}
.editor__a11y-pill--error {
  background: var(--cms-danger-soft);
  border-color: var(--cms-danger);
  color: var(--cms-danger);
}

.editor__publish {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 15px;
  color: var(--cms-ink-inverse);
  border-radius: 7px;
  background: var(--editor-accent);
  box-shadow: var(--cms-elev-1);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  transition:
    background-color var(--cms-motion-fast) var(--cms-ease-out),
    box-shadow var(--cms-motion-fast) var(--cms-ease-out),
    transform var(--cms-motion-fast) var(--cms-ease-out);
}

.editor__publish:hover {
  color: var(--cms-ink-inverse);
  background: var(--cms-accent-hover);
}

.editor__publish:active {
  transform: scale(0.97);
}

.editor__back[aria-disabled="true"],
.editor__publish[aria-disabled="true"] {
  pointer-events: none;
  opacity: 0.62;
}

.editor__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.editor__write-lock-status {
  position: fixed;
  top: 70px;
  left: 50%;
  z-index: 90;
  transform: translateX(-50%);
  padding: 8px 12px;
  border: 1px solid var(--cms-line);
  border-radius: 999px;
  color: var(--cms-ink);
  background: var(--cms-surface);
  box-shadow: var(--cms-shadow-md, 0 6px 20px rgba(0, 0, 0, 0.14));
  font-size: 12px;
  font-weight: 600;
}

.editor__top-row {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

@media (max-width: 767px) {
  .editor__topbar {
    gap: 7px;
    padding: 0 8px;
  }

  .editor__topbar-divider,
  .editor__title,
  .editor__scope {
    display: none;
  }

  .editor__a11y-pill {
    padding: 0 8px;
  }

  .editor__a11y-pill > span:not(.material-icons-outlined) {
    display: none;
  }
}

/* Mobile: the three side-by-side panels crush together below ~640px (each
   keeps its desktop px width from the inline style), so the editor is unusable.
   Stack them vertically — nav, then preview, then settings — each full-width
   and scrollable, and drop the drag-to-resize handles (no pointer to drag). */
@media (max-width: 767px) {
  .editor__top-row {
    flex-direction: column;
    overflow-y: auto;
  }

  .editor__sidebar,
  .editor__preview,
  .editor__settings {
    width: auto !important; /* override the inline px width set for desktop */
    flex-shrink: 0;
    border-right: none;
  }

  .editor__sidebar {
    max-height: 45vh;
    border-bottom: 1px solid var(--editor-border);
  }

  .editor__preview {
    min-height: 55vh;
  }

  .editor__settings {
    border-top: 1px solid var(--editor-border);
  }

  .editor__resize-handle {
    display: none;
  }
}

.editor__sidebar {
  flex-shrink: 0;
  border-right: 1px solid var(--editor-border);
  overflow-y: auto;
}

.editor__resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  position: relative;
  z-index: 1;
  outline: none;

  /* Subtle affordance: thin grey line at rest */
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 32px;
    background: var(--cms-line-strong);
    border-radius: 1px;
    transition: opacity 0.15s;
    opacity: 0.6;
  }

  /* Enlarged hit target: 16px wide invisible zone */
  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -6px;
    width: 16px;
  }

  &:hover,
  &:active,
  &:focus-visible {
    background: var(--editor-accent);

    &::before {
      opacity: 0;
    }
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.3);
  }
}

.editor__resize-handle--horizontal {
  height: 4px;
  flex-shrink: 0;
  cursor: row-resize;
  background: transparent;
  transition: background 0.15s;
  position: relative;
  z-index: 1;
  outline: none;

  /* Subtle affordance: thin grey line at rest */
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 32px;
    height: 2px;
    background: var(--cms-line-strong);
    border-radius: 1px;
    transition: opacity 0.15s;
    opacity: 0.6;
  }

  /* Enlarged hit target: 16px tall invisible zone */
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -6px;
    height: 16px;
  }

  &:hover,
  &:active,
  &:focus-visible {
    background: var(--editor-accent);

    &::before {
      opacity: 0;
    }
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.3);
  }
}

.editor__preview {
  flex: 1;
  min-width: 0;
}

/* Block iframe from stealing pointer events during resize */
.editor__preview--resizing {
  pointer-events: none;
}

.editor__settings {
  flex-shrink: 0;
  border-left: 1px solid var(--editor-border);
  overflow-y: auto;
  padding: 16px;
  background: var(--cms-surface-subtle);
}

.editor__settings--theme {
  overflow: hidden;
  padding: 0;
}

/* Tablet / compact desktop: keep a useful preview canvas and present the
   contextual inspector above it instead of squeezing three fixed-width
   columns into the viewport. */
@media (min-width: 768px) and (max-width: 1199px) {
  .editor__top-row {
    position: relative;
  }

  .editor__sidebar {
    width: 240px !important;
  }

  .editor__resize-handle {
    display: none;
  }

  .editor__settings {
    display: none;
    position: absolute;
    z-index: 20;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, calc(100% - 240px)) !important;
    box-shadow: -12px 0 32px rgba(15, 23, 42, 0.16);
  }

  .editor__settings--active {
    display: block;
  }
}

/* Bottom drawer: Timeline */
.editor__bottom-drawer {
  flex-shrink: 0;
  border-top: 1px solid var(--cms-line);
  background: var(--cms-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor__timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  border-bottom: 1px solid var(--cms-line);
  background: var(--cms-surface-subtle);
  flex-shrink: 0;
}

.editor__timeline-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--cms-ink-body);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.editor__timeline-close {
  padding: 0 6px;
  font-size: 16px;
  line-height: 1;
  border: none;
}

.editor__timeline-body {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

/* Timeline toggle button (floating at bottom) */
.editor__timeline-toggle {
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-body);
  background: var(--cms-surface);
  border: 1px solid var(--cms-line-strong);
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition:
    background-color var(--cms-motion-fast) var(--cms-ease-out),
    box-shadow var(--cms-motion-fast) var(--cms-ease-out),
    transform var(--cms-motion-fast) var(--cms-ease-out);
}

.editor__timeline-toggle:hover {
  background: var(--cms-surface-subtle);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}

.editor__timeline-toggle:active {
  transform: translateX(-50%) scale(0.97);
}

.editor__loading,
.editor__error {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  z-index: 100;
}

.editor__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--cms-line);
  border-top-color: var(--cms-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.editor__error {
  color: var(--cms-danger);
}

.editor__error button {
  margin-top: 12px;
  padding: 8px 20px;
  background: var(--cms-accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.editor__error button:hover {
  background: var(--cms-accent-hover);
}

.editor__retry-btn {
  margin-top: 12px;
  padding: 8px 20px;
  background: var(--cms-accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-decoration: none;
  font-size: 14px;
}

.editor__retry-btn:hover {
  background: var(--cms-accent-hover);
  color: white;
}
</style>

<style lang="scss">
@use '~/admin/assets/scss/admin';
</style>
