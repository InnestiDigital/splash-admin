<template>
  <div class="preview-panel">
    <!-- Device controls -->
    <div class="preview-panel__toolbar">
      <div class="preview-panel__identity">
        <span class="material-icons-outlined" aria-hidden="true">visibility</span>
        <span>Preview</span>
      </div>
      <div class="preview-panel__device-toggle" role="group" aria-label="Preview device">
        <button
          v-for="mode in availableModes"
          :key="mode.name"
          type="button"
          class="device-btn"
          :class="{ 'device-btn--active': deviceMode === mode.name }"
          :title="mode.label"
          :aria-label="mode.label"
          :aria-pressed="deviceMode === mode.name"
          @click="deviceMode = mode.name"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" v-html="mode.svgPath"></svg>
        </button>
      </div>
      <span class="preview-panel__dimensions">{{ dimensionLabel }}</span>
      <!--
        "Viewing as" — overrides the preview's visitor auth state so blocks
        limited via Visibility → Who sees this can be inspected from both
        sides. The editor iframe holds no real token, so without this a
        signed-in-only block would simply never appear.
      -->
      <label class="preview-panel__viewas">
        <span class="preview-panel__viewas-label">Viewing as</span>
        <select v-model="viewAs" class="preview-panel__viewas-select" aria-label="Preview visitor state">
          <option value="default">Signed out</option>
          <option value="auth">Signed in</option>
        </select>
      </label>
      <button type="button" class="preview-panel__refresh" aria-label="Reload preview" title="Reload preview" @click="reloadPreview">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
      </button>
    </div>

    <!-- Device frame -->
    <div ref="frameRef" class="preview-panel__frame" :class="`preview-panel__frame--${deviceMode}`">
      <!-- Loading / Error states -->
      <div v-if="!isPreviewReady" class="preview-panel__status">
        <div v-if="previewError" class="preview-panel__error">
          <p>{{ previewError }}</p>
          <button @click="reloadPreview">Retry</button>
        </div>
        <div v-else class="preview-panel__loading">
          <div class="preview-panel__spinner" />
          <p>Loading preview...</p>
        </div>
      </div>

      <!-- Scaled canvas: sizer holds the scaled footprint, iframe renders at true device width -->
      <div class="preview-panel__sizer" :style="sizerStyle">
        <!-- Preview iframe -->
        <iframe
          ref="iframeRef"
          :src="previewUrl"
          title="Live website preview"
          class="preview-panel__iframe"
          :class="{ 'preview-panel__iframe--hidden': !isPreviewReady }"
          :style="iframeStyle"
          data-preview
          @load="onIframeLoad"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, toRaw } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { applyCanvasBlockPlacementPatch } from '~/admin/utils/canvasPlacementPatch'
import { useSiteStore } from '~/admin/stores/siteStore'
import { getSectionTypeSchemasV2 } from '~/shared/features/cms/sectionSchemas'
import { layeredSectionTypes } from '~/shared/features/cms/section-layouts/layeredSlots'
import { resolveFixedPreviewFrame } from '~/admin/utils/previewFrameGeometry'
import { resolvePreviewClickTarget, resolvePreviewSelectionId } from '~/admin/utils/previewSelection'
import { DEFAULT_FRAME } from '~/shared/features/layout/layoutDefaults'
import { BRAND_CANVAS_PAGE_META_KEY, isBrandCanvasPageMeta } from '~/shared/types/brandCanvas'
import type { EditorToNuxtMessage } from '~/shared/types/previewMessages'
import {
  PREVIEW_MESSAGE_DISPATCHER_KEY,
  type PreviewMessageDispatcher,
} from '~/shared/types/previewMessages'

function cloneForPostMessage<T>(obj: T): T {
  return JSON.parse(JSON.stringify(toRaw(obj))) as T
}

const MAX_QUEUED_MESSAGES = 50

const store = useEditorStore()
const siteStore = useSiteStore()

// Which section types accept free-placement geometry, from the same `.v2.json`
// data the server gate reads. Computed rather than captured once: the editor can
// switch sites without remounting this panel.
const layeredTypes = computed(() =>
  layeredSectionTypes(getSectionTypeSchemasV2(siteStore.activeSiteTheme || 'standalone')),
)

// Preview is always same-origin: the SPA bundles all themes, config comes via
// postMessage from the editor, and same-origin eliminates cross-origin DNS/TLS issues.
const previewTargetOrigin = window.location.origin

/**
 * Desktop is a design width, not "whatever the pane happens to be". A pane-wide
 * iframe reported a tablet-ish viewport to the preview, so desktop placement and
 * collapse decisions were invisible while authoring. Mirrors the layout frame's
 * design width so the preview and the published page agree by construction.
 */
const DESKTOP_DESIGN_WIDTH = DEFAULT_FRAME.designWidth ?? 1440

interface DeviceMode {
  name: string
  label: string
  /** Every mode renders at a real design width — none inherits the pane width. */
  width: number
  /** Fixed canvas height; ordinary responsive device previews remain scrollable. */
  height?: number
  svgPath: string
}

const deviceModes: DeviceMode[] = [
  {
    name: 'desktop',
    label: 'Desktop',
    width: DESKTOP_DESIGN_WIDTH,
    svgPath: '<path d="M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2V4z"/>',
  },
  {
    name: 'tablet',
    label: 'Tablet',
    width: 820,
    svgPath: '<path d="M12 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8zM4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4z"/><path d="M8 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>',
  },
  {
    name: 'mobile',
    label: 'Mobile',
    width: 375,
    svgPath: '<path d="M11 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6zM5 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H5z"/><path d="M8 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>',
  },
]

const defaultDevice: DeviceMode = deviceModes[0] ?? {
  name: 'desktop',
  label: 'Desktop',
  width: DESKTOP_DESIGN_WIDTH,
  svgPath: '',
}

/**
 * A brand-canvas page carries its fixed asset size at `meta.brandCanvas` (the
 * editor-facing mirror). When the selected page has one, a fourth device mode
 * appears at that exact width and is auto-selected — composing a 1200×630
 * asset inside a 375px phone frame is misleading WYSIWYG.
 */
const canvasMeta = computed(() => {
  const meta = store.currentPage?.meta as Record<string, unknown> | undefined
  const value = meta?.[BRAND_CANVAS_PAGE_META_KEY]
  return isBrandCanvasPageMeta(value) ? value : null
})

const availableModes = computed<DeviceMode[]>(() => {
  const meta = canvasMeta.value
  if (!meta) return deviceModes
  return [
    {
      name: 'canvas',
      label: `Canvas — ${meta.width}×${meta.height}`,
      width: meta.width,
      height: meta.height,
      svgPath: '<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9zM3.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-9z"/>',
    },
    ...deviceModes,
  ]
})

const activeDevice = computed(() =>
  availableModes.value.find(m => m.name === deviceMode.value) ?? defaultDevice)

// State
function initialDeviceMode(): string {
  if (typeof window === 'undefined') return 'desktop'
  try {
    const stored = window.localStorage.getItem('splash.previewDevice')
    // 'canvas' is per-page, never restored from storage — it may not exist here.
    if (stored && deviceModes.some(m => m.name === stored)) return stored
  }
  catch {
    // localStorage unavailable (private mode / SSR) — fall through to default
  }
  return 'desktop'
}

const deviceMode = ref(initialDeviceMode())

// Entering a canvas page snaps the frame to its real size; leaving one while
// still in canvas mode falls back to desktop (the mode no longer exists).
watch(canvasMeta, (meta) => {
  if (meta) deviceMode.value = 'canvas'
  else if (deviceMode.value === 'canvas') deviceMode.value = 'desktop'
}, { immediate: true })

watch(deviceMode, (v) => {
  // 'canvas' is a property of the selected page, not a preference.
  if (v === 'canvas') return
  try {
    localStorage.setItem('splash.previewDevice', v)
  }
  catch {
    // ignore persistence failures
  }
})

// "Viewing as" — 'default' means no override (falls back to the real token,
// which the editor iframe never has, i.e. signed out). Deliberately NOT
// persisted: an author should not return days later to a preview silently
// pinned to a signed-in view of a mostly signed-out site.
const viewAs = ref<'default' | 'auth'>('default')

watch(viewAs, (v) => {
  sendToPreview({
    type: 'AUTH_STATE_OVERRIDE',
    source: 'splash',
    isAuthenticated: v === 'auth' ? true : null,
  })
})

// Available space + scaled-canvas geometry
const frameRef = ref<HTMLElement | null>(null)
const availWidth = ref(0)
const availHeight = ref(0)

const deviceWidth = computed(() => activeDevice.value.width)
const deviceHeight = computed<number | null>(() => activeDevice.value.height ?? null)

const fixedFrame = computed(() => resolveFixedPreviewFrame(
  deviceWidth.value,
  deviceHeight.value,
  availWidth.value,
  availHeight.value,
))
const scale = computed(() => fixedFrame.value.scale)

const sizerStyle = computed(() => ({
  width: Math.round(fixedFrame.value.sizerWidth) + 'px',
  height: Math.round(fixedFrame.value.sizerHeight) + 'px',
}))

const iframeStyle = computed(() => {
  const geometry = fixedFrame.value
  return {
    width: geometry.iframeWidth + 'px',
    height: Math.round(geometry.iframeHeight) + 'px',
    transform: geometry.scale < 1 ? 'scale(' + geometry.scale + ')' : undefined,
    transformOrigin: 'top left',
    maxWidth: 'none',
    flex: 'none',
  }
})

const dimensionLabel = computed(() => {
  const s = scale.value
  return activeDevice.value.label + ' — ' + deviceWidth.value + 'px'
    + (s < 1 ? ' · ' + Math.round(s * 100) + '%' : '')
})
const iframeRef = ref<HTMLIFrameElement | null>(null)
const isPreviewReady = ref(false)
const previewError = ref<string | null>(null)
const hasSentInitialConfig = ref(false)
let readyTimeout: ReturnType<typeof setTimeout> | null = null
let configUpdateDebounce: ReturnType<typeof setTimeout> | null = null
let sceneSyncDebounce: ReturnType<typeof setTimeout> | null = null
let previousSceneIds = new Set<string>()
let ro: ResizeObserver | null = null
const queuedMessages: EditorToNuxtMessage[] = []

// Preview URL - set once on mount to prevent iframe reloads on page switch.
// Page switching is handled entirely via CONFIG_UPDATE postMessage.
const previewUrl = ref('')

type PreviewWindow = Window & {
  [PREVIEW_MESSAGE_DISPATCHER_KEY]?: PreviewMessageDispatcher
}

function sameSceneMessage(a: EditorToNuxtMessage, b: EditorToNuxtMessage): boolean {
  if (!('scene' in a) || !('scene' in b)) {
    return false
  }

  return (
    (a.type === 'SCENE_UPSERT' || a.type === 'PREVIEW_SCENE') &&
    (b.type === 'SCENE_UPSERT' || b.type === 'PREVIEW_SCENE') &&
    a.scene.id === b.scene.id
  )
}

function findQueuedMessageIndex(message: EditorToNuxtMessage): number {
  return queuedMessages.findIndex((queued) => {
    if (sameSceneMessage(queued, message)) {
      return true
    }

    if (message.type === 'SCENE_REMOVE') {
      return (
        (queued.type === 'SCENE_REMOVE' && queued.sceneId === message.sceneId) ||
        (('scene' in queued) && queued.scene.id === message.sceneId)
      )
    }

    if (message.type === 'SCENE_SCRUB') {
      return queued.type === 'SCENE_SCRUB' && queued.sceneId === message.sceneId
    }

    if (message.type === 'SCENE_COMMAND') {
      return (
        queued.type === 'SCENE_COMMAND' &&
        queued.sceneId === message.sceneId &&
        queued.command === message.command
      )
    }

    if (message.type === 'SECTION_SELECT') {
      return queued.type === 'SECTION_SELECT'
    }

    if (message.type === 'LAYOUT_SELECT') {
      return queued.type === 'LAYOUT_SELECT'
    }

    return false
  })
}

function queueMessage(message: EditorToNuxtMessage) {
  const safeMessage = cloneForPostMessage(message)
  const existingIndex = findQueuedMessageIndex(safeMessage)

  if (existingIndex >= 0) {
    queuedMessages.splice(existingIndex, 1, safeMessage)
    return
  }

  if (queuedMessages.length >= MAX_QUEUED_MESSAGES) {
    queuedMessages.shift()
  }

  queuedMessages.push(safeMessage)
}

function postToPreview(message: EditorToNuxtMessage) {
  const win = iframeRef.value?.contentWindow
  if (!win) return false
  try {
    win.postMessage(cloneForPostMessage(message), previewTargetOrigin)
    return true
  }
  catch (err) {
    console.warn('[PreviewPanel] postMessage failed', err)
    return false
  }
}

function sendToPreview(message: EditorToNuxtMessage) {
  if (!isPreviewReady.value || !iframeRef.value?.contentWindow) {
    queueMessage(message)
    return
  }

  if (!postToPreview(message)) {
    queueMessage(message)
  }
}

function flushQueuedMessages() {
  while (queuedMessages.length > 0) {
    const message = queuedMessages.shift()
    if (!message) {
      continue
    }
    if (!postToPreview(message)) {
      queuedMessages.unshift(message)
      break
    }
  }
}

function syncScenesToPreview(scenes = store.scenes) {
  const currentIds = new Set(scenes.map(s => s.id))

  for (const scene of scenes) {
    sendToPreview({
      type: 'SCENE_UPSERT',
      source: 'splash',
      scene,
    })
  }

  for (const oldId of previousSceneIds) {
    if (!currentIds.has(oldId)) {
      sendToPreview({
        type: 'SCENE_REMOVE',
        source: 'splash',
        sceneId: oldId,
      })
    }
  }

  previousSceneIds = currentIds
}

function handleMessage(event: MessageEvent) {
  // Preview is always same-origin - reject messages from other origins.
  if (event.origin !== window.location.origin) return

  const data = event.data
  if (!data || data.source !== 'nuxt-preview') return

  switch (data.type) {
    case 'PREVIEW_READY':
      if (readyTimeout) clearTimeout(readyTimeout)
      isPreviewReady.value = true
      previewError.value = null
      if (store.previewConfig && !hasSentInitialConfig.value) {
        sendInitialConfig()
        hasSentInitialConfig.value = true
      }
      syncScenesToPreview(store.scenes)
      // A fresh iframe has no override, so re-assert it — otherwise a reload
      // silently drops the author back to the signed-out view while the
      // toolbar still reads "Signed in".
      if (viewAs.value !== 'default') {
        sendToPreview({ type: 'AUTH_STATE_OVERRIDE', source: 'splash', isAuthenticated: true })
      }
      flushQueuedMessages()
      break

    case 'SECTION_CLICKED': {
      // The legacy preview protocol uses SECTION_CLICKED for both block chrome
      // and section backgrounds. Resolve the concrete entity before changing
      // inspectors so section padding never selects a nonexistent block id.
      const target = resolvePreviewClickTarget(
        data.sectionId,
        store.blocks.map((block: any) => block.id),
        store.sections.map((section: any) => section.id),
      )
      if (target?.kind === 'block') void store.selectBlock(target.id)
      else if (target?.kind === 'section') void store.selectSection(target.id)
      break
    }

    case 'LAYOUT_CLICKED':
      store.selectLayoutComponent(data.area)
      break

    case 'REDIRECT_REQUEST':
      store.setCurrentPageBySlug(data.pageId)
      break

    case 'LAYOUT_META_UPDATE':
      store.setLayoutMeta({
        hasHeader: data.hasHeader,
        hasFooter: data.hasFooter,
      })
      break

    case 'SCATTER_ITEM_PATCH': {
      // Try the blockId provided by the substrate first. If the preview-side
      // inject/prop plumbing for identity isn't available (provide chain gets
      // lost across slot boundaries, async render paths, etc.), fall back to
      // locating the block by scanning for the patched itemId across all
      // scatter-collage blocks. Item ids are UUIDs (per Task A.1 migration) so
      // they're unique across the draft state for a given site.
      let resolvedBlockId = data.blockId
      const isKnownBlock = store.blocks.some((b: any) => b.id === resolvedBlockId)
      if (!isKnownBlock) {
        const match = store.blocks.find((b: any) =>
          b.type === 'scatter-collage'
          && Array.isArray((b.settings as any)?.items)
          && (b.settings as any).items.some((it: any) => it?.id === data.patch.id),
        )
        if (match) resolvedBlockId = match.id
      }
      // Persistence failures remain visible and retryable in the global save
      // status; consume the promise here so postMessage handling never creates
      // an unhandled rejection.
      void store.patchBlockItem(resolvedBlockId, data.patch.id, data.patch).catch(() => {})
      break
    }

    case 'CANVAS_BLOCK_PLACEMENT_PATCH': {
      applyCanvasBlockPlacementPatch(store, data, layeredTypes.value)
      break
    }
  }
}

/**
 * Returns the full slug path for the current page (e.g. "home/[id]" for a child
 * page).
 *
 * Walks the WHOLE ancestor chain, not just the direct parent: `buildPreviewConfig`
 * nests the page under every ancestor slug, so a one-level path made the preview's
 * `getPage()` miss for anything deeper than a child — the iframe then rendered an
 * empty body. Uses the same `getAncestorSlugs` the config builder uses so the two
 * cannot drift.
 */
function currentPageSlug(): string {
  // When viewing a child site page, use the mount path as the slug
  if (store.activeChildPageSlug) return store.activeChildPageSlug

  const page = store.currentPage
  if (!page) return 'home'
  const ancestors = store.getAncestorSlugs(page)
  return [...ancestors, page.slug].join('/')
}

/**
 * Builds routeParams for the preview message.
 * For static child pages (e.g. home/macbook), automatically injects id=childSlug
 * so theme components can read previewRouteParams.id without the user having to
 * manually enter a value in the URL params field.
 */
function buildRouteParams(): Record<string, string> {
  const page = store.currentPage
  const explicit = { ...store.previewRouteParams }
  if (page?.parentId && !/\[.+\]/.test(page.slug)) {
    return { id: page.slug, ...explicit }
  }
  return explicit
}

function sendInitialConfig() {
  const config = store.previewConfig
  if (!config) return

  sendToPreview({
    type: 'PREVIEW_INIT',
    source: 'splash',
    config,
    pageSlug: currentPageSlug(),
    routeParams: buildRouteParams(),
  })
}

function sendConfigUpdate() {
  if (!isPreviewReady.value) return
  const config = store.previewConfig
  if (!config) return

  sendToPreview({
    type: 'CONFIG_UPDATE',
    source: 'splash',
    config,
    pageSlug: currentPageSlug(),
    routeParams: buildRouteParams(),
  })
}

function onIframeLoad() {
  // Start a timeout to detect unresponsive previews.
  // Do NOT reset isPreviewReady or hasSentInitialConfig here - the iframe's
  // postMessage(PREVIEW_READY) is queued during script execution and arrives
  // BEFORE the @load event. Resetting here would clobber already-received state.
  // State reset for manual reloads is handled by reloadPreview().
  if (readyTimeout) clearTimeout(readyTimeout)
  readyTimeout = setTimeout(() => {
    if (!isPreviewReady.value) {
      previewError.value = 'Preview is not responding. Try refreshing the preview or reloading the page.'
    }
  }, 5000)
}

function reloadPreview() {
  isPreviewReady.value = false
  previewError.value = null
  hasSentInitialConfig.value = false
  queuedMessages.length = 0
  previousSceneIds = new Set<string>()
  if (iframeRef.value) {
    iframeRef.value.src = previewUrl.value
  }
}

// Watch config and page together to avoid double-firing on page change.
// Page switches send immediately; block/theme/layout setting edits are debounced.
watch(
  [() => store.previewConfig, () => store.currentPage?.id, () => store.activeChildPageSlug] as const,
  ([config, pageId, childSlug], [, oldPageId, oldChildSlug]) => {
    if (!config) return
    if (!hasSentInitialConfig.value && isPreviewReady.value) {
      sendInitialConfig()
      hasSentInitialConfig.value = true
      return
    }
    if (!hasSentInitialConfig.value || !isPreviewReady.value) return
    if (configUpdateDebounce) clearTimeout(configUpdateDebounce)
    if (pageId !== oldPageId || childSlug !== oldChildSlug) {
      sendConfigUpdate()
    } else {
      configUpdateDebounce = setTimeout(sendConfigUpdate, 150)
    }
  },
  { deep: true },
)

// Watch for selection changes and sync to preview, so selecting in the left
// list highlights AND scrolls the iframe to the entity. This watches sections
// as well as blocks: it used to watch `selectedBlockId` alone, which meant
// picking a section in the navigation tree opened its settings while the
// preview stayed where it was — and, because selecting a section clears the
// block selection, actively cleared the preview's highlight. One watcher over
// the resolved id keeps the two selections from posting conflicting messages.
watch(
  () => resolvePreviewSelectionId(store.selectedBlockId, store.selectedSectionId),
  (selectionId) => {
    sendToPreview({
      type: 'SECTION_SELECT',
      source: 'splash',
      sectionId: selectionId,
    })
  },
)

// Watch for layout selection and sync to preview
watch(
  () => store.selectedLayoutType,
  (layoutType) => {
    sendToPreview({
      type: 'LAYOUT_SELECT',
      source: 'splash',
      layoutId: layoutType === 'header' || layoutType === 'footer' ? layoutType : null,
    })
  },
)

// Watch for route params changes (dynamic slug fields in NavigationTree) and push update
watch(
  () => store.previewRouteParams,
  () => {
    if (!isPreviewReady.value || !hasSentInitialConfig.value) return
    if (configUpdateDebounce) clearTimeout(configUpdateDebounce)
    configUpdateDebounce = setTimeout(() => {
      sendConfigUpdate()
    }, 150)
  },
  { deep: true },
)

// Watch for scene changes and forward to preview iframe.
// Debounced to 150 ms to coalesce rapid mutations (keyframe drag ticks,
// duration slider input events) into a single SCENE_UPSERT per scene.
// `immediate: true` is intentionally omitted — the PREVIEW_READY handler
// already calls syncScenesToPreview for initial load.
watch(
  () => store.scenes,
  (scenes) => {
    if (sceneSyncDebounce) clearTimeout(sceneSyncDebounce)
    sceneSyncDebounce = setTimeout(() => syncScenesToPreview(scenes), 150)
  },
  { deep: true },
)

onMounted(() => {
  // Always use same-origin /__preview - the SPA bundles all themes and config is
  // delivered via postMessage, so the iframe origin doesn't need to match the site domain.
  // This avoids DNS/TLS issues with custom subdomains and cross-origin postMessage complexity.
  previewUrl.value = `/__preview?site=${store.siteId || ''}`
  ;(window as PreviewWindow)[PREVIEW_MESSAGE_DISPATCHER_KEY] = sendToPreview
  window.addEventListener('message', handleMessage)

  ro = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect
    if (r) {
      availWidth.value = r.width
      availHeight.value = r.height
    }
  })
  if (frameRef.value) ro.observe(frameRef.value)
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
  const previewWindow = window as PreviewWindow
  if (previewWindow[PREVIEW_MESSAGE_DISPATCHER_KEY] === sendToPreview) {
    delete previewWindow[PREVIEW_MESSAGE_DISPATCHER_KEY]
  }
  if (readyTimeout) clearTimeout(readyTimeout)
  if (configUpdateDebounce) clearTimeout(configUpdateDebounce)
  if (sceneSyncDebounce) clearTimeout(sceneSyncDebounce)
  ro?.disconnect()
})
</script>

<style scoped>
.preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  container-type: inline-size;
}

.preview-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface);
}

.preview-panel__identity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 700;
  white-space: nowrap;
}

.preview-panel__identity .material-icons-outlined {
  color: var(--cms-accent, var(--cms-accent));
  font-size: 17px;
}

.preview-panel__device-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: 8px;
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.device-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .device-btn:not(.device-btn--active):hover,
  .preview-panel__refresh:hover {
    color: var(--cms-ink, var(--cms-ink));
    background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  }
}

.device-btn--active {
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
}

.device-btn:active,
.preview-panel__refresh:active {
  transform: scale(0.94);
}

.preview-panel__dimensions {
  margin-left: auto;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.preview-panel__viewas {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: 11px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
}

.preview-panel__viewas-label {
  white-space: nowrap;
}

.preview-panel__viewas-select {
  appearance: none;
  height: 28px;
  padding: 0 25px 0 8px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background-color: var(--cms-surface);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%236e6659' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 14px;
  font: inherit;
  font-size: 11px;
}

.preview-panel__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.preview-panel__frame {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(16px, 2.2vw, 28px);
  overflow: auto;
  position: relative;
  background-color: var(--cms-surface-sunken, var(--cms-surface-sunken));
  background-image:
    linear-gradient(rgba(110, 102, 89, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(110, 102, 89, 0.045) 1px, transparent 1px);
  background-size: 24px 24px;
  overscroll-behavior: contain;
  transition: padding var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out);
}

.preview-panel__sizer {
  position: relative;
  overflow: hidden;
  border-radius: var(--cms-radius-card, 10px);
}

.preview-panel__iframe {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-2, 0 1px 2px rgba(33, 30, 25, 0.05), 0 8px 24px rgba(33, 30, 25, 0.07));
  transition: opacity var(--cms-motion-normal, 180ms) var(--cms-ease-out, ease-out);
}

.preview-panel__iframe--hidden {
  opacity: 0;
  pointer-events: none;
}

.preview-panel__status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
}

.preview-panel__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.preview-panel__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--cms-line-strong, var(--cms-line-strong));
  border-top-color: var(--cms-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.preview-panel__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--cms-danger);
}

.preview-panel__error button {
  padding: 8px 16px;
  background: var(--cms-accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.preview-panel__error button:hover {
  background: var(--cms-accent-hover);
}

@container (max-width: 560px) {
  .preview-panel__toolbar {
    gap: 6px;
    padding-inline: 8px;
  }

  .preview-panel__identity > span:last-child,
  .preview-panel__dimensions,
  .preview-panel__viewas-label {
    display: none;
  }
}
</style>
