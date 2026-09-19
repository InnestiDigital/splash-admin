import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import {
  staggerSequential,
  staggerCascade,
  staggerQuick,
  easingPresets,
} from '~/shared/features/cms/animation/presets'
import { deriveStaggerVariant } from '~/shared/features/cms/animation/presets/stagger'
import { parseScrollAnchor } from '~/shared/features/cms/animation/adapters/scrollAdapter'
import type {
  AnimationEntry,
  AnimationScene,
  ReducedMotionMode,
  ScrollAnchor,
  ScrollTrigger,
} from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Shared types & constants
// ---------------------------------------------------------------------------

export type ScopeOption =
  | 'all'
  | 'stagger-sequential'
  | 'stagger-cascade'
  | 'stagger-quick'
  | 'stagger-custom'
  | 'first-only'
  | 'specific-index'

export const scopeOptions: { value: ScopeOption; label: string }[] = [
  { value: 'all', label: 'All at once' },
  { value: 'stagger-sequential', label: 'Stagger (Sequential)' },
  { value: 'stagger-cascade', label: 'Stagger (Cascade)' },
  { value: 'stagger-quick', label: 'Stagger (Quick)' },
  { value: 'stagger-custom', label: 'Stagger (Custom)' },
  { value: 'first-only', label: 'First only' },
  { value: 'specific-index', label: 'Specific index' },
]

export const DEFAULT_DURATION = 600
/** Default easing sourced from canonical easingPresets (single source of truth). */
export const DEFAULT_EASING = easingPresets[0].value
export const DEFAULT_START_ANCHOR: ScrollAnchor = { edge: 'top', viewport: 0.85 }
export const DEFAULT_END_ANCHOR: ScrollAnchor = { edge: 'bottom', viewport: 0.15 }

export interface MotionEntryMatch {
  scene: AnimationScene
  entry: AnimationEntry
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Shared editor state and handlers for a single motion entry.
 *
 * Accepts a reactive `matchRef` — a computed ref resolving to
 * `{ scene, entry }` when an entry exists, or `null` when there is none.
 * The watcher syncs local draft refs from the store on every change
 * (including immediate). All mutation handlers write back through
 * `useEditorStore()` actions.
 *
 * Used by both AnimationPanel.vue and MotionDetail.vue to eliminate the
 * ~250 lines of duplicated local-ref, watcher, and handler code.
 */
export function useMotionEntryEditor(matchRef: Ref<MotionEntryMatch | null>) {
  const store = useEditorStore()

  // ── Local draft refs ──────────────────────────────────────────────────────

  const localDuration = ref(DEFAULT_DURATION)
  const localDelay = ref(0)
  const localTarget = ref('root')
  const localEasing = ref(DEFAULT_EASING)
  const localReducedMotion = ref('inherit')
  const localScope = ref<ScopeOption>('all')
  const localItemIndex = ref(0)
  const localStaggerDelay = ref(staggerSequential.delay)
  const localStartAnchor = ref<ScrollAnchor>({ ...DEFAULT_START_ANCHOR })
  const localEndAnchor = ref<ScrollAnchor>({ ...DEFAULT_END_ANCHOR })
  const localScrub = ref(true)

  const isStaggerScope = computed(
    () =>
      localScope.value === 'stagger-sequential' ||
      localScope.value === 'stagger-cascade' ||
      localScope.value === 'stagger-quick' ||
      localScope.value === 'stagger-custom',
  )

  // ── Sync watcher ─────────────────────────────────────────────────────────

  watch(
    matchRef,
    (match) => {
      if (match) {
        const { scene, entry } = match

        localDuration.value = entry.duration ?? DEFAULT_DURATION
        localDelay.value =
          entry.position?.type === 'absolute' ? entry.position.ms : 0
        localTarget.value = entry.target.part
        localEasing.value = entry.easing ?? DEFAULT_EASING
        localReducedMotion.value = entry.reducedMotion ?? 'inherit'

        // Sync scope from entry stagger / itemIndex fields.
        // Use the persisted staggerVariant directly when available; fall back to
        // deriveStaggerVariant() for legacy rows pre-dating the variant column.
        if (entry.staggerGroup && entry.staggerDelay != null) {
          const variant = entry.staggerVariant ?? deriveStaggerVariant(entry.staggerDelay)
          switch (variant) {
            case 'cascade': localScope.value = 'stagger-cascade'; break
            case 'quick':   localScope.value = 'stagger-quick';   break
            case 'custom':  localScope.value = 'stagger-custom';  break
            // 'sequential' and 'wave' (no UI option yet) both map to sequential
            default:        localScope.value = 'stagger-sequential'
          }
          localStaggerDelay.value = entry.staggerDelay
          localItemIndex.value = 0
        } else if (entry.target.itemIndex != null) {
          if (entry.target.itemIndex === 0 && localScope.value !== 'specific-index') {
            localScope.value = 'first-only'
          } else {
            localScope.value = 'specific-index'
            localItemIndex.value = entry.target.itemIndex
          }
        } else {
          localScope.value = 'all'
          localItemIndex.value = 0
        }

        // Sync scroll trigger state.
        // parseScrollAnchor handles both structured ScrollAnchor objects and
        // GSAP-shorthand strings that may be present in seeded data.
        if (scene.trigger.type === 'scroll') {
          const scrollTrigger = scene.trigger as ScrollTrigger
          localStartAnchor.value = parseScrollAnchor(scrollTrigger.start as any)
          localEndAnchor.value = scrollTrigger.end
            ? parseScrollAnchor(scrollTrigger.end as any)
            : { ...DEFAULT_END_ANCHOR }
          localScrub.value = scrollTrigger.scrub !== false
        }
      } else {
        localDuration.value = DEFAULT_DURATION
        localDelay.value = 0
        localTarget.value = 'root'
        localEasing.value = DEFAULT_EASING
        localReducedMotion.value = 'inherit'
        localScope.value = 'all'
        localItemIndex.value = 0
        localStaggerDelay.value = staggerSequential.delay
        localStartAnchor.value = { ...DEFAULT_START_ANCHOR }
        localEndAnchor.value = { ...DEFAULT_END_ANCHOR }
        localScrub.value = true
      }
    },
    { immediate: true },
  )

  // ── Entry-level handlers ──────────────────────────────────────────────────

  function commitDuration() {
    const match = matchRef.value
    if (!match) return
    store.updateEntry(match.scene.id, match.entry.id, { duration: localDuration.value })
  }

  function commitDelay() {
    const match = matchRef.value
    if (!match) return
    store.updateEntry(match.scene.id, match.entry.id, {
      position: { type: 'absolute', ms: localDelay.value },
    })
  }

  function commitStaggerDelay() {
    const match = matchRef.value
    if (!match) return
    const newDelay = localStaggerDelay.value
    // Re-derive variant: snaps back to a named preset if the value matches exactly,
    // otherwise marks as 'custom'. Also updates localScope for UI consistency.
    const derivedVariant = deriveStaggerVariant(newDelay)
    switch (derivedVariant) {
      case 'cascade': localScope.value = 'stagger-cascade'; break
      case 'quick':   localScope.value = 'stagger-quick';   break
      case 'custom':  localScope.value = 'stagger-custom';  break
      default:        localScope.value = 'stagger-sequential'
    }
    store.updateEntry(match.scene.id, match.entry.id, {
      staggerDelay: newDelay,
      staggerVariant: derivedVariant,
    })
  }

  function onEasingChange(value: string) {
    localEasing.value = value
    const match = matchRef.value
    if (!match) return
    store.updateEntry(match.scene.id, match.entry.id, { easing: value })
  }

  function onReducedMotionChange(value: string) {
    localReducedMotion.value = value
    const match = matchRef.value
    if (!match) return
    store.updateEntry(match.scene.id, match.entry.id, {
      reducedMotion: value === 'inherit' ? undefined : (value as ReducedMotionMode),
    })
  }

  function onScopeChange(value: string) {
    localScope.value = value as ScopeOption
    const match = matchRef.value
    if (!match) return

    const updates: Partial<AnimationEntry> = {}
    updates.staggerGroup = undefined
    updates.staggerDelay = undefined
    updates.staggerVariant = undefined
    const newTarget = { ...match.entry.target }
    delete newTarget.itemIndex

    if (value === 'stagger-sequential') {
      updates.staggerGroup = 'auto'
      localStaggerDelay.value = staggerSequential.delay
      updates.staggerDelay = localStaggerDelay.value
      updates.staggerVariant = 'sequential'
    } else if (value === 'stagger-cascade') {
      updates.staggerGroup = 'auto'
      localStaggerDelay.value = staggerCascade.delay
      updates.staggerDelay = localStaggerDelay.value
      updates.staggerVariant = 'cascade'
    } else if (value === 'stagger-quick') {
      updates.staggerGroup = 'auto'
      localStaggerDelay.value = staggerQuick.delay
      updates.staggerDelay = localStaggerDelay.value
      updates.staggerVariant = 'quick'
    } else if (value === 'stagger-custom') {
      updates.staggerGroup = 'auto'
      updates.staggerDelay = localStaggerDelay.value
      updates.staggerVariant = 'custom'
    } else if (value === 'first-only') {
      newTarget.itemIndex = 0
    } else if (value === 'specific-index') {
      newTarget.itemIndex = localItemIndex.value
    }

    updates.target = newTarget
    store.updateEntry(match.scene.id, match.entry.id, updates)
  }

  function onItemIndexChange(value: number) {
    localItemIndex.value = value
    const match = matchRef.value
    if (!match) return
    store.updateEntry(match.scene.id, match.entry.id, {
      target: { ...match.entry.target, itemIndex: value },
    })
  }

  // ── Scroll trigger handlers ───────────────────────────────────────────────

  function updateScrollTrigger(
    updates: Partial<Pick<ScrollTrigger, 'start' | 'end' | 'scrub'>>,
  ) {
    const match = matchRef.value
    if (!match || match.scene.trigger.type !== 'scroll') return
    const currentTrigger = match.scene.trigger as ScrollTrigger
    store.updateScene(match.scene.id, {
      trigger: { ...currentTrigger, ...updates },
    })
  }

  function onScrubChange(checked: boolean) {
    localScrub.value = checked
    updateScrollTrigger({ scrub: checked })
  }

  function onStartEdgeChange(edge: 'top' | 'center' | 'bottom') {
    localStartAnchor.value = { ...localStartAnchor.value, edge }
    updateScrollTrigger({ start: { ...localStartAnchor.value } })
  }

  function onStartViewportChange(viewport: number) {
    localStartAnchor.value = { ...localStartAnchor.value, viewport }
    updateScrollTrigger({ start: { ...localStartAnchor.value } })
  }

  function onEndEdgeChange(edge: 'top' | 'center' | 'bottom') {
    localEndAnchor.value = { ...localEndAnchor.value, edge }
    updateScrollTrigger({ end: { ...localEndAnchor.value } })
  }

  function onEndViewportChange(viewport: number) {
    localEndAnchor.value = { ...localEndAnchor.value, viewport }
    updateScrollTrigger({ end: { ...localEndAnchor.value } })
  }

  return {
    // Refs
    localDuration,
    localDelay,
    localTarget,
    localEasing,
    localReducedMotion,
    localScope,
    localItemIndex,
    localStaggerDelay,
    localStartAnchor,
    localEndAnchor,
    localScrub,
    // Computed
    isStaggerScope,
    // Handlers
    commitDuration,
    commitDelay,
    commitStaggerDelay,
    onEasingChange,
    onReducedMotionChange,
    onScopeChange,
    onItemIndexChange,
    onScrubChange,
    onStartEdgeChange,
    onStartViewportChange,
    onEndEdgeChange,
    onEndViewportChange,
  }
}
