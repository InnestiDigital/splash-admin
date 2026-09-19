import { ref, computed, toRaw } from 'vue'
import type {
  PageLayoutOverrides,
  LayoutChromeElement,
  LayoutHeaderConfig,
  LayoutFooterConfig,
  LayoutHeaderOverride,
  LayoutFooterOverride,
  LayoutBackgroundConfig,
  LayoutScrollConfig,
} from '~/shared/types/layout'

/**
 * Deep clone via JSON round-trip. Avoids `structuredClone` because Vue's
 * reactive Proxies fail with `DataCloneError` when passed in directly.
 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T
}

/**
 * Editing harness for `meta.layoutOverrides` on a page.
 *
 * Wraps the overrides in a deep-cloned ref, tracks dirtiness against a JSON
 * snapshot of the original, and exposes mutators for header/footer/background/
 * scroll/chrome sections. The composable does not enforce overridePolicy —
 * the consuming panel is responsible for disabling fields when policy denies.
 */
export function useLayoutOverridesEditor(initial: PageLayoutOverrides | undefined) {
  const safeInitial: PageLayoutOverrides = initial ? clone(toRaw(initial)) : {}
  const overrides = ref<PageLayoutOverrides>(clone(safeInitial))
  const original = ref(JSON.stringify(safeInitial))
  const dirty = computed(() => JSON.stringify(overrides.value) !== original.value)

  function updateHeaderPalette(patch: Partial<NonNullable<LayoutHeaderConfig['palette']>>) {
    if (!overrides.value.header) overrides.value.header = {}
    overrides.value.header.palette = {
      ...(overrides.value.header.palette ?? {}),
      ...patch,
    }
  }

  /**
   * Tri-state writer for a header override key. `undefined` removes the key —
   * an absent key is what "inherit from the layout" means — and drops the
   * whole `header` object once nothing is overridden anymore.
   */
  function setHeaderField<K extends keyof LayoutHeaderOverride>(
    key: K,
    value: LayoutHeaderOverride[K] | undefined,
  ) {
    const next: LayoutHeaderOverride = { ...(overrides.value.header ?? {}) }
    if (value === undefined) delete next[key]
    else next[key] = value
    if (Object.keys(next).length === 0) delete overrides.value.header
    else overrides.value.header = next
  }

  /** Tri-state writer for a footer override key. See `setHeaderField`. */
  function setFooterField<K extends keyof LayoutFooterOverride>(
    key: K,
    value: LayoutFooterOverride[K] | undefined,
  ) {
    const next: LayoutFooterOverride = { ...(overrides.value.footer ?? {}) }
    if (value === undefined) delete next[key]
    else next[key] = value
    if (Object.keys(next).length === 0) delete overrides.value.footer
    else overrides.value.footer = next
  }

  function updateFooterPalette(patch: Partial<NonNullable<LayoutFooterConfig['palette']>>) {
    if (!overrides.value.footer) overrides.value.footer = {}
    overrides.value.footer.palette = {
      ...(overrides.value.footer.palette ?? {}),
      ...patch,
    }
  }

  function updateBackground(patch: Partial<LayoutBackgroundConfig>) {
    overrides.value.background = {
      ...(overrides.value.background ?? {}),
      ...patch,
    } as any
  }

  function updateScroll(patch: Partial<LayoutScrollConfig>) {
    overrides.value.scroll = {
      ...(overrides.value.scroll ?? {}),
      ...patch,
    }
  }

  function updateChromeElement(id: string, patch: Partial<LayoutChromeElement> & { enabled?: boolean }) {
    if (!overrides.value.chrome) overrides.value.chrome = {}
    overrides.value.chrome[id] = {
      ...(overrides.value.chrome[id] ?? {}),
      ...patch,
    } as any
  }

  function clearChromeElement(id: string) {
    if (overrides.value.chrome) delete overrides.value.chrome[id]
  }

  function reset(next?: PageLayoutOverrides) {
    const target = next ? clone(toRaw(next)) : safeInitial
    overrides.value = clone(target)
    original.value = JSON.stringify(target)
  }

  function markClean() {
    original.value = JSON.stringify(overrides.value)
  }

  return {
    overrides,
    dirty,
    updateHeaderPalette,
    updateFooterPalette,
    setHeaderField,
    setFooterField,
    updateBackground,
    updateScroll,
    updateChromeElement,
    clearChromeElement,
    reset,
    markClean,
  }
}
