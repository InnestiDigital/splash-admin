import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getCsrfToken } from '~/admin/utils/csrf'
import type { MediaRecord, MediaPage } from '~/server/storage/types'

/**
 * A read-only cache of one site's media library.
 *
 * It exists for the assistant, which needs two things the pickers never did:
 *
 *  1. A SYNCHRONOUS inventory. The editor digest provider returns a value, not
 *     a promise, so the media list has to already be in memory by the time a
 *     turn is composed — hence `ensureLoaded`, called when the editor mounts
 *     and refreshed on a TTL rather than fetched inside the provider.
 *  2. An AUTHORITATIVE existence check for one id. `attach_media` refuses to
 *     write an id the library does not hold, and the cached page is a
 *     truncated, possibly stale view — so a cache miss falls through to the
 *     record endpoint instead of being reported as "no such media".
 *
 * Nothing here writes: uploads and deletes stay with the pickers and the media
 * page, and the assistant's blast radius does not grow to include them.
 */

/** Matches the digest ceiling — a larger page would be trimmed on the way out. */
const PAGE_SIZE = 100
/** How long a loaded page is reused before the next `ensureLoaded` refetches. */
const TTL_MS = 60_000

export type MediaKind = 'image' | 'video' | 'other'

export function mediaKind(contentType: string | undefined): MediaKind {
  if (contentType?.startsWith('image/')) return 'image'
  if (contentType?.startsWith('video/')) return 'video'
  return 'other'
}

export const useMediaLibraryStore = defineStore('media-library', () => {
  const items = ref<MediaRecord[]>([])
  /** Rows the site holds, including the ones beyond `items`. */
  const total = ref(0)
  const loadedSiteId = ref<string | null>(null)
  const error = ref<string | null>(null)

  let loadedAt = 0
  /**
   * Coalesces concurrent loads. The digest provider fires per turn and the
   * executor can ask for a lookup in the same tick; without this they would
   * each open their own request for the same page.
   */
  let inflight: Promise<void> | null = null

  function headers(): Record<string, string> {
    const token = getCsrfToken()
    return token ? { 'X-CSRF-Token': token } : {}
  }

  function reset(): void {
    items.value = []
    total.value = 0
    loadedSiteId.value = null
    error.value = null
    loadedAt = 0
  }

  async function refresh(siteId: string): Promise<void> {
    if (!siteId) return
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const page = await $fetch<MediaPage>(`/api/admin/s/${siteId}/media`, {
          headers: headers(),
          query: { perPage: PAGE_SIZE },
        })
        items.value = page.items ?? []
        total.value = page.total ?? items.value.length
        loadedSiteId.value = siteId
        loadedAt = Date.now()
        error.value = null
      }
      catch (err) {
        // Swallowed into the ref, never thrown: the only callers are a digest
        // provider that must still return a digest and a lookup that falls
        // through to the record endpoint. A throw here would cost the turn.
        error.value = err instanceof Error ? err.message : 'media library could not be loaded'
      }
      finally {
        inflight = null
      }
    })()
    return inflight
  }

  /** Fetch when the site changed or the cached page has aged past the TTL. */
  async function ensureLoaded(siteId: string): Promise<void> {
    if (!siteId) return
    if (loadedSiteId.value === siteId && Date.now() - loadedAt < TTL_MS) return
    if (loadedSiteId.value !== siteId) reset()
    await refresh(siteId)
  }

  /** Whether a page for `siteId` is in memory. False means "unknown", not "empty". */
  function isLoadedFor(siteId: string): boolean {
    return loadedSiteId.value === siteId
  }

  function cached(siteId: string, mediaId: string): MediaRecord | null {
    if (!isLoadedFor(siteId)) return null
    return items.value.find(item => item.id === mediaId) ?? null
  }

  /**
   * Resolve one id, cache first and the record endpoint second.
   *
   * The fallthrough is not an optimisation detail: the cached page is capped at
   * `PAGE_SIZE` and up to a minute old, so a miss says nothing about whether
   * the row exists — and an asset the operator uploaded during this very
   * conversation is exactly the one they will ask the assistant to place.
   */
  async function lookup(siteId: string, mediaId: string): Promise<MediaRecord | null> {
    if (!siteId || !mediaId) return null
    const hit = cached(siteId, mediaId)
    if (hit) return hit
    try {
      const record = await $fetch<MediaRecord>(
        `/api/admin/s/${siteId}/media/${encodeURIComponent(mediaId)}`,
        { headers: headers() },
      )
      return record?.id ? record : null
    }
    catch {
      // A 404 is the answer, not an error — and any other failure has to read
      // the same way here, because the caller's only safe move on "the host
      // cannot confirm this asset exists" is to refuse the write either way.
      return null
    }
  }

  return { items, total, error, loadedSiteId, ensureLoaded, refresh, reset, isLoadedFor, cached, lookup }
})
