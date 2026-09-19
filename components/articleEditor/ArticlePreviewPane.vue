<!--
  ArticlePreviewPane — collapsible realtime preview iframe for the article editor.

  Hosts an iframe pointed at the SPA route `/__preview/article?siteId=<>&articleId=<>`.
  The iframe loads independently and listens for postMessage updates carrying
  the current draft state. When the user types in the editor, this component
  forwards the new draft (debounced) so the preview re-renders in near-realtime.

  Refresh button forces a hard iframe reload — useful when the user uploads new
  media in another tab or the iframe state desyncs.

  Mounted by the article edit page when `previewOpen=true`. The toggle lives
  in `ArticleEditorHeader`. State of `previewOpen` is page-level (UI-only).

  Sandbox: `allow-same-origin allow-scripts` so postMessage works AND the SPA
  route can run its Nuxt app. NOT `allow-top-navigation` (read-only view).
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { UseArticleEditorReturn } from '~/admin/composables/useArticleEditor'

interface Props {
  siteId: string
  articleId: string
  editor: UseArticleEditorReturn | null
  /** Debounce window for forwarding draft changes. Defaults to 500ms. */
  debounceMs?: number
}

const props = withDefaults(defineProps<Props>(), { debounceMs: 500 })

const emit = defineEmits<{
  (e: 'close'): void
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeReady = ref(false)
const iframeKey = ref(0)

// Build the iframe src. Including siteId + articleId in the query lets the
// preview SPA route resolve the article without further postMessage handshake.
// `site` carries the same id under the name every PUBLIC endpoint scopes on:
// the iframe renders the theme shell, whose header/footer read /api/site-config,
// and those resolve a tenant from the hostname — which names none when the
// admin runs on the platform domain.
const iframeSrc = computed(() => {
  if (!props.siteId || !props.articleId) return ''
  const site = encodeURIComponent(props.siteId)
  return `/__preview/article?siteId=${site}&site=${site}&articleId=${encodeURIComponent(props.articleId)}`
})

// Build the preview payload from the editor's draft state. Returns `null` when
// the editor hasn't mounted yet (initial paint of the parent page) — caller
// skips the postMessage in that case.
function buildPayload(): Record<string, any> | null {
  const e = props.editor
  if (!e) return null
  // JSON round-trip is load-bearing, not defensive. Every draft ref holds a Vue
  // reactive Proxy, and the structured-clone algorithm rejects a Proxy outright
  // — `postMessage` threw `DataCloneError` on every single post, so the iframe
  // only ever showed the last SAVED state. The payload is plain JSON data, so a
  // round-trip both strips the proxies and matches what the endpoint parses.
  return toPlainJson({
    contentData: e.draftContentData.value,
    slug: e.draftSlug.value,
    title: e.draftTitle.value,
    excerpt: e.draftExcerpt.value,
    seo: e.draftSeo.value,
    // Admin-only template settings. Sent as a row override so an unsaved
    // toggle (e.g. "Show related articles") renders immediately. Omitted when
    // absent so the endpoint keeps the persisted value instead of blanking it.
    ...(e.draftTemplateSettings?.value
      ? { templateSettings: e.draftTemplateSettings.value }
      : {}),
    // featuredImageId is canonical-synced from contentData, so no separate
    // override needed — the endpoint reads it off the row when not in body.
  })
}

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function postPayload() {
  const iframe = iframeRef.value
  if (!iframe || !iframe.contentWindow) return
  const payload = buildPayload()
  if (!payload) return
  iframe.contentWindow.postMessage(
    { source: 'article-preview', type: 'update', payload },
    '*',
  )
}

// Debounced forwarder. We coalesce keystroke storms to one postMessage per
// `debounceMs` window so the iframe doesn't thrash.
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function schedulePost() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    if (iframeReady.value) postPayload()
  }, props.debounceMs)
}

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

// Watch every draft surface. `deep: true` so contentData object mutations fire.
watch(
  () => props.editor && [
    props.editor.draftContentData.value,
    props.editor.draftTitle.value,
    props.editor.draftExcerpt.value,
    props.editor.draftSlug.value,
    props.editor.draftSeo.value,
    props.editor.draftFeaturedImageId.value,
    props.editor.draftTemplateSettings?.value ?? null,
  ],
  () => schedulePost(),
  { deep: true },
)

// When the editor's article identity flips (route nav between articles within
// the same edit page mount), the iframe stays put — but we want a fresh render
// pointed at the new article. Forcing a remount via key bump is simplest;
// otherwise the iframe still has the previous article's state cached server-side.
watch(
  () => props.articleId,
  () => {
    iframeReady.value = false
    iframeKey.value += 1
  },
)

// postMessage from iframe → parent. Listens for `ready` to know when the SPA
// route has mounted + bound its message listener. We send the initial payload
// at that point so the very first render reflects in-flight unsaved edits.
function handleMessage(event: MessageEvent) {
  const msg = event.data
  if (!msg || typeof msg !== 'object') return
  if (msg.source !== 'article-preview') return
  if (msg.type === 'ready') {
    iframeReady.value = true
    // Fire an immediate update so the iframe sees current draft state without
    // waiting for the next keystroke.
    postPayload()
  }
}

// Manual refresh: bump the iframe key so Vue remounts the <iframe>, which
// causes a hard reload. The iframe's onload re-fires and the `ready`
// handshake triggers a fresh postMessage.
function onRefresh() {
  iframeReady.value = false
  iframeKey.value += 1
}

function onClose() {
  emit('close')
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', handleMessage)
}

onBeforeUnmount(() => {
  clearDebounce()
  if (typeof window !== 'undefined') {
    window.removeEventListener('message', handleMessage)
  }
})

defineExpose({
  /** For tests: manually trigger a postMessage as if a draft change just happened. */
  _postPayload: postPayload,
})
</script>

<template>
  <aside class="article-preview-pane" data-component="article-preview-pane">
    <header class="article-preview-pane__header">
      <span class="article-preview-pane__label">
        <span class="material-icons-outlined" aria-hidden="true">visibility</span>
        Preview
      </span>
      <div class="article-preview-pane__actions">
        <button
          type="button"
          class="article-preview-pane__action"
          data-action="refresh"
          aria-label="Refresh preview"
          @click="onRefresh"
        >
          <span class="material-icons-outlined" aria-hidden="true">refresh</span>
        </button>
        <button
          type="button"
          class="article-preview-pane__action"
          data-action="close"
          aria-label="Close preview"
          @click="onClose"
        >
          <span class="material-icons-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </header>

    <div class="article-preview-pane__frame-wrap">
      <iframe
        v-if="iframeSrc"
        :key="iframeKey"
        ref="iframeRef"
        class="article-preview-pane__frame"
        :src="iframeSrc"
        title="Article preview"
        sandbox="allow-same-origin allow-scripts"
        loading="lazy"
      />
    </div>
  </aside>
</template>

<style scoped>
.article-preview-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 60rem;
  background: #f1f3f4;
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  overflow: hidden;
}

.article-preview-pane__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.8rem 1.2rem;
  background: var(--cms-surface);
  border-bottom: 1px solid var(--cms-line);
}

.article-preview-pane__label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.3rem;
  font-weight: 500;
  color: var(--cms-ink-body);
}

.article-preview-pane__label .material-icons-outlined {
  font-size: 1.6rem;
  color: var(--cms-ink-muted);
}

.article-preview-pane__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.article-preview-pane__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.3rem;
  color: var(--cms-ink-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.article-preview-pane__action:hover {
  background: #f1f3f4;
  color: var(--cms-ink-body);
  border-color: var(--cms-line);
}

.article-preview-pane__action:focus-visible {
  outline: 2px solid var(--cms-accent);
  outline-offset: 1px;
}

.article-preview-pane__action .material-icons-outlined {
  font-size: 1.8rem;
}

.article-preview-pane__frame-wrap {
  flex: 1;
  display: flex;
  background: var(--cms-surface);
  overflow: hidden;
}

.article-preview-pane__frame {
  width: 100%;
  height: 100%;
  min-height: 60rem;
  border: 0;
  background: var(--cms-surface);
  display: block;
}
</style>
