import { ref, type Ref } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { extractFetchMessage } from '~/admin/utils/fetchError'
import { isRecord } from '~/shared/types/guards'

/**
 * `GET /brand-formats/generations` is scoped to exactly one template.
 *
 * It used to accept a `formatId` too, for the compiled-format tier — that arm
 * is gone from the endpoint (it 400s on the param now), so a scope object is
 * the one shape rather than a union. Kept as an object rather than a bare
 * string so a second scope can return without every call site changing.
 */
export type GenerationHistoryScope = { templateId: string }

export interface UseGenerationHistoryOptions<T> {
  /** Narrows one wire row — the caller's own shape, checked at ingress. */
  narrowRow: (value: unknown) => value is T
  /** Shown when no site is selected — phrased per caller. */
  noSiteMessage: string
  /** Fallback when a failed request carries no server message. */
  failureMessage: string
}

export interface UseGenerationHistoryReturn<T> {
  rows: Ref<T[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  /**
   * Loads the history for `scope`. Skips the request when the same scope is
   * already loaded, unless `force`. A `presetId` narrows the history the same
   * way it narrows generation itself — omitted, the query is unscoped.
   */
  load: (scope: GenerationHistoryScope, options?: { force?: boolean; presetId?: string | null }) => Promise<void>
  /** Drops any loaded rows and abandons an in-flight request. For a scope switch that must not show a stale strip. */
  reset: () => void
}

function scopeParam(scope: GenerationHistoryScope): [string, string] {
  return ['templateId', scope.templateId]
}

function scopeKey(scope: GenerationHistoryScope): string {
  const [key, value] = scopeParam(scope)
  return `${key}:${value}`
}

/** `encodeURIComponent`, not `URLSearchParams` — the latter encodes a space as `+`, not `%20`. */
function buildQuery(scope: GenerationHistoryScope, presetId?: string | null): string {
  const [key, value] = scopeParam(scope)
  let query = `${key}=${encodeURIComponent(value)}`
  if (presetId) query += `&presetId=${encodeURIComponent(presetId)}`
  return query
}

/**
 * Past "save to library" rows for one template, newest first — the loader
 * `brandFormatStore` and `brandTemplateStore` each carried a line-for-line copy
 * of before this. The caller keeps its own row narrower and its own mapping
 * from the narrowed row to whatever its gallery wants; this composable owns
 * only the fetch, the supersede token and the "already loaded" cache.
 *
 * A scope switch supersedes any load still in flight: the previous scope's
 * rows are cleared up front (a stale strip under a new heading is worse than
 * an empty one), and a slow reply for the scope the caller left can never win
 * just because it resolves last — only the reply whose token still matches
 * `requestToken` may write `rows`/`error`/`loading`.
 */
export function useGenerationHistory<T>(options: UseGenerationHistoryOptions<T>): UseGenerationHistoryReturn<T> {
  const rows = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const error = ref<string | null>(null)

  let loadedKey: string | null = null
  let requestToken = 0

  async function load(
    scope: GenerationHistoryScope,
    loadOptions: { force?: boolean; presetId?: string | null } = {},
  ): Promise<void> {
    const siteStore = useSiteStore()
    const base = siteStore.apiBase
    if (!base) {
      error.value = options.noSiteMessage
      rows.value = []
      loadedKey = null
      return
    }

    // A template id is tenant-local. Include the site in the cache key so two
    // sites that happen to use the same id can never share history rows.
    const key = `${base}:${scopeKey(scope)}`
    // Only a reply that landed sets `loadedKey`, so a previous failure never
    // sticks as "already loaded".
    if (loadedKey === key && !loadOptions.force) return

    const token = ++requestToken
    loading.value = true
    error.value = null
    rows.value = []
    loadedKey = null

    try {
      const response = await adminFetch<unknown>(
        `${base}/brand-formats/generations?${buildQuery(scope, loadOptions.presetId)}`,
      )
      if (token !== requestToken || siteStore.apiBase !== base) return
      const list = isRecord(response) && Array.isArray(response.generations) ? response.generations : []
      rows.value = list.filter(options.narrowRow)
      loadedKey = key
    } catch (e: unknown) {
      if (token !== requestToken || siteStore.apiBase !== base) return
      error.value = extractFetchMessage(e, options.failureMessage)
      rows.value = []
      loadedKey = null
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  function reset(): void {
    // Abandons any in-flight request too — its reply must not repopulate the
    // scope the caller just left.
    requestToken += 1
    rows.value = []
    loading.value = false
    error.value = null
    loadedKey = null
  }

  return { rows, loading, error, load, reset }
}
