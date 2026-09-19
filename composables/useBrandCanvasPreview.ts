import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import { isBrandCanvasPaintedMessage, isBrandCanvasReadyMessage } from '~/shared/types/previewMessages'
import type { BrandCanvasContentSource, BrandCanvasPreviewFidelity } from '~/shared/types/previewMessages'

export interface UseBrandCanvasPreviewOptions {
  /** Native canvas size in px. A getter, not a value — the selected canvas (and its size) can change. */
  width: () => number
  height: () => number
  /**
   * Fires once the route reports it painted cleanly (`error === null`). The
   * template workspace re-pushes its override map here — the iframe's `load`
   * event fires before the route's own snapshot fetch resolves, so a push made
   * at `load` can land before anything is listening.
   */
  onReady?: () => void
}

export interface UseBrandCanvasPreviewReturn {
  /** The frame's outer element — observed for width so the canvas scales to fit the column. */
  frameEl: Ref<HTMLElement | null>
  /** The iframe itself — the `postMessage` target, and the `event.source` replies are checked against. */
  previewFrame: Ref<HTMLIFrameElement | null>
  previewScale: ComputedRef<number>
  scaledHeight: ComputedRef<number>
  /** The route's own verdict on the tree it painted; `null` = painted cleanly. */
  previewError: Ref<string | null>
  /** Non-fatal degradations reported alongside a clean paint. */
  previewWarnings: Ref<string[]>
  /** Which tree the route actually painted (`draft`, approved snapshot, or export payload). */
  previewContentSource: Ref<BrandCanvasContentSource>
  /** Whether that tree exactly matches the request or is a visible fallback. */
  previewFidelity: Ref<BrandCanvasPreviewFidelity>
  /** Revision of the exact draft tree shown in the manager preview. */
  previewDraftRevision: Ref<string | null>
  /** Current route verdict. `loading` lasts until BRAND_CANVAS_READY arrives. */
  previewStatus: Ref<'loading' | 'ready' | 'error'>
  /** Latest override revision confirmed after the browser finished painting. */
  latestPaintedRevision: Ref<number>
  /** Call when the preview `src` changes — the previous verdict describes the canvas that just left. */
  resetPreviewStatus: () => void
}

/**
 * The scaled-iframe scaffolding shared by every admin surface that previews a
 * brand canvas through `/__preview/brand-canvas`: fit-to-column scaling via a
 * `transform: scale()`, and the route's own settled signal
 * (`BRAND_CANVAS_READY`) rather than the iframe's `load` event, which fires
 * before the route's snapshot fetch resolves.
 *
 * Same-origin by construction — the canvas route is this app's own SPA route —
 * so the message guard checks both the origin AND that the reply came from
 * THIS iframe, not some other same-origin frame on the page.
 */
export function useBrandCanvasPreview(options: UseBrandCanvasPreviewOptions): UseBrandCanvasPreviewReturn {
  const frameEl = ref<HTMLElement | null>(null)
  const previewFrame = ref<HTMLIFrameElement | null>(null)
  const frameWidth = ref(0)

  const previewScale = computed(() => {
    const width = options.width()
    if (width === 0 || frameWidth.value === 0) return 1
    return Math.min(1, frameWidth.value / width)
  })

  const scaledHeight = computed(() => Math.round(options.height() * previewScale.value))

  const previewError = ref<string | null>(null)
  const previewWarnings = ref<string[]>([])
  const previewContentSource = ref<BrandCanvasContentSource>('none')
  const previewFidelity = ref<BrandCanvasPreviewFidelity>('unavailable')
  const previewDraftRevision = ref<string | null>(null)
  const previewStatus = ref<'loading' | 'ready' | 'error'>('loading')
  const latestPaintedRevision = ref(0)

  function resetPreviewStatus(): void {
    previewError.value = null
    previewWarnings.value = []
    previewContentSource.value = 'none'
    previewFidelity.value = 'unavailable'
    previewDraftRevision.value = null
    previewStatus.value = 'loading'
    latestPaintedRevision.value = 0
  }

  const previewTargetOrigin = typeof window === 'undefined' ? '' : window.location.origin

  function onMessage(event: MessageEvent): void {
    if (event.origin !== previewTargetOrigin) return
    if (event.source !== previewFrame.value?.contentWindow) return
    const message: unknown = event.data
    if (isBrandCanvasPaintedMessage(message)) {
      if (message.error !== null) {
        previewError.value = message.error
        previewStatus.value = 'error'
        return
      }
      latestPaintedRevision.value = Math.max(latestPaintedRevision.value, message.revision)
      previewError.value = null
      previewStatus.value = 'ready'
      return
    }
    if (!isBrandCanvasReadyMessage(message)) return
    previewError.value = message.error
    previewWarnings.value = message.warnings
    previewContentSource.value = message.contentSource
    previewFidelity.value = message.fidelity
    previewDraftRevision.value = message.draftRevision
    previewStatus.value = message.error === null ? 'ready' : 'error'
    if (message.error === null) options.onReady?.()
  }

  let observer: ResizeObserver | null = null

  // The frame may not exist at mount (a conditionally-rendered detail panel)
  // or may exist unconditionally from the start — `watch` with `immediate`
  // covers both: it runs once during setup, when a template ref is still
  // null, and again whenever the ref actually binds to an element.
  watch(frameEl, (el, _previous, onCleanup) => {
    observer?.disconnect()
    observer = null
    if (!el || typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver((entries) => {
      frameWidth.value = entries[0]?.contentRect.width ?? 0
    })
    observer.observe(el)
    frameWidth.value = el.clientWidth
    onCleanup(() => { observer?.disconnect(); observer = null })
  }, { immediate: true })

  onMounted(() => {
    window.addEventListener('message', onMessage)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('message', onMessage)
    observer?.disconnect()
    observer = null
  })

  return {
    frameEl,
    previewFrame,
    previewScale,
    scaledHeight,
    previewError,
    previewWarnings,
    previewContentSource,
    previewFidelity,
    previewDraftRevision,
    previewStatus,
    latestPaintedRevision,
    resetPreviewStatus,
  }
}
