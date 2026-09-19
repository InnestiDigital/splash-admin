/**
 * useArticleEditor — scoped editor state for the structured-article edit page
 * (Blog-2 task 2.D.3b).
 *
 * Owns:
 *   - draft refs for contentData + canonical scalars (title/excerpt/slug/seo/featuredImage)
 *   - dirty tracking against an immutable JSON baseline
 *   - autosave (debounced 2s after the last change; queued while a save is in flight)
 *   - manual save / publish / unpublish
 *   - field-level validation errors parsed from the PUT 400 response
 *
 * Conceptually a smaller, scoped sibling of `editorStore` (the page-builder
 * Pinia store). Article authoring lives outside the block-editor flow, so the
 * surface stays composable + per-page rather than global.
 *
 * Save-then-publish dirty rule (spec § 7.1, § 6.4):
 *   `publish()` first calls `save()` if `isDirty` is true. Save failures abort
 *   publish with `reason: 'save_failed'`. This guarantees published-version
 *   snapshots reflect the current draft, never a stale published row.
 *
 * Validation errors:
 *   The PUT endpoint surfaces `field <id>: <message>` strings (one per failure)
 *   via `createError({ statusCode: 400, statusMessage: ... })`. We parse the
 *   leading `field <id>:` prefix and key the result by field id so the editor
 *   UI can render messages inline. Non-field errors fall under `_form`.
 */
import { ref, computed, watch, onBeforeUnmount, type Ref } from 'vue'
import { adminFetch } from '~/admin/utils/adminFetch'
import {
  useEditorChangeStore,
  editorChangeKey,
  editorChangeScope,
} from '~/admin/stores/editorChangeStore'

const AUTOSAVE_DELAY_MS = 2000
const SAVED_RESET_MS = 3000

type LocaleMap = Record<string, string>
type RichLocaleMap = Record<string, unknown> // TipTap doc per locale
type TextOrLocale = string | LocaleMap | RichLocaleMap

export interface ArticleSeoDraft {
  metaTitle?: LocaleMap | null
  metaDescription?: LocaleMap | null
  ogImageId?: string | null
  noIndex?: boolean
}

export interface ArticleEditorArticle {
  id: string
  siteId: string
  slug: string
  locale: string
  title: string | LocaleMap
  excerpt?: string | LocaleMap | null
  featuredImageId?: string | null
  contentData?: Record<string, unknown> | null
  seo?: ArticleSeoDraft | null
  publishedAt?: string | null
  /**
   * Admin-only template settings. NOT draft-tracked for dirty/save purposes —
   * `PUT /articles/:id` strips the field and `TemplateSettingsPanel` owns
   * persistence through `PUT /pages/:id/template-settings`. We mirror it here
   * purely so the preview pane can render unsaved setting changes.
   */
  templateSettings?: Record<string, unknown> | null
  /**
   * Server's view at load time of whether the live public revision lags the
   * draft. The public article read serves the immutable `articlePublications`
   * snapshot, so a saved edit stays invisible until a republish.
   */
  hasUnpublishedChanges?: boolean
  // other fields (parentId, updatedAt, …) flow through unchanged but are not draft-tracked
}

export interface ArticleEditorTemplate {
  id: string
  contentSchema?: unknown[]
}

export interface ArticleEditorMedia {
  [id: string]: { id: string; url: string; alt?: LocaleMap | null; caption?: LocaleMap | null }
}

export interface UseArticleEditorParams {
  siteId: Ref<string>
  articleId: Ref<string>
  article: Ref<ArticleEditorArticle>
  template?: Ref<ArticleEditorTemplate | null>
  media?: Ref<ArticleEditorMedia>
  /** When false, the autosave watcher is registered but never schedules. Defaults to true. */
  autosave?: boolean
  /**
   * Resource kind. Picks the admin endpoint family the composable hits for
   * save / publish / unpublish — `'articles'` (default) or `'blogs'`. Blog-
   * index editing reuses the same draft-tracking + autosave + canonical-sync
   * mechanics; only the URL changes. Blog-index pages have no
   * publish/unpublish endpoints in V2 — `publish()` and `unpublish()` no-op
   * silently for `'blogs'` so the host page can hide those buttons.
   */
  kind?: 'articles' | 'blogs'
  onSaved?: () => void
  onPublished?: () => void
  onUnpublished?: () => void
  onError?: (err: unknown) => void
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export type PublishState = 'idle' | 'publishing' | 'published' | 'unpublishing' | 'unpublished' | 'error'

export interface SaveResult {
  ok: boolean
  errors?: Record<string, string[]>
}

export interface PublishResult {
  ok: boolean
  reason?: 'save_failed' | 'request_failed'
}

/** Deep clone via JSON round-trip — same approach as `useLayoutEditor`. */
function clone<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value))
}

/** Stable JSON snapshot for dirty comparison. Sorts keys so reorder doesn't lie. */
function snapshot(value: unknown): string {
  return JSON.stringify(value ?? null, replacerSortKeys)
}

function replacerSortKeys(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      sorted[k] = (v as Record<string, unknown>)[k]
    }
    return sorted
  }
  return v
}

/**
 * Parse a server validation error string into a `{ fieldId: [message] }` map.
 *
 * Server format (from `validateContentData`): `field <id>: <message>` — one per
 * failure. The PUT endpoint wraps the first failure into a 400 statusMessage,
 * so we usually see ONE field per response. We still parse defensively in case
 * the endpoint is later upgraded to multi-error.
 */
function parseValidationErrors(message: string | null | undefined): Record<string, string[]> {
  if (!message) return {}
  const errors: Record<string, string[]> = {}
  // Split on newlines OR semicolons in case multi-error formatting arrives later.
  const lines = String(message).split(/[\n;]+/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const match = /^field\s+([\w.-]+)\s*:\s*(.+)$/i.exec(line)
    if (match) {
      const id = match[1]
      const msg = match[2]
      if (!errors[id]) errors[id] = []
      errors[id].push(msg)
    } else {
      if (!errors._form) errors._form = []
      errors._form.push(line)
    }
  }
  return errors
}

/** Pull a useful message out of an ofetch FetchError (or any thrown shape). */
function extractErrorMessage(err: unknown): string {
  const e = err as any
  return (
    e?.data?.statusMessage
    ?? e?.data?.message
    ?? e?.statusMessage
    ?? e?.message
    ?? 'Request failed'
  )
}

function extractStatus(err: unknown): number | null {
  const e = err as any
  return e?.statusCode ?? e?.response?.status ?? e?.status ?? null
}

export function useArticleEditor(params: UseArticleEditorParams) {
  const {
    siteId,
    articleId,
    article,
    autosave = true,
    kind = 'articles',
    onSaved,
    onPublished,
    onUnpublished,
    onError,
  } = params

  // Resolve admin endpoint family. The blog edit surface reuses the same
  // composable mechanics; only the URL family flips.
  const isBlog = kind === 'blogs'

  // ── Draft state (seeded from initial article; re-seeded if article identity flips) ─
  const draftContentData = ref<Record<string, unknown>>(clone(article.value.contentData ?? {}))
  const draftTitle = ref<TextOrLocale>(clone(article.value.title))
  const draftExcerpt = ref<TextOrLocale | null>(clone(article.value.excerpt ?? null))
  const draftSlug = ref<string>(article.value.slug)
  const draftSeo = ref<ArticleSeoDraft>(clone(article.value.seo ?? {}))
  const draftFeaturedImageId = ref<string | null>(article.value.featuredImageId ?? null)

  // Template settings live OUTSIDE the dirty baseline and outside the PUT body
  // on purpose: the article endpoint strips them and `TemplateSettingsPanel`
  // saves them through the admin template-settings endpoint on its own lane.
  // This ref exists so an unsaved settings change can still reach the preview
  // (the preview endpoint accepts `templateSettings` as a row override).
  const draftTemplateSettings = ref<Record<string, unknown> | null>(
    clone(article.value.templateSettings ?? null),
  )

  // Baseline for dirty comparison. Updated after every successful save and on
  // article-identity change. A ref (not a plain `let`) so the `isDirty`
  // computed re-evaluates when we bake a new baseline post-save — otherwise
  // the computed sees stale values and `isDirty` stays true forever after the
  // first save.
  const baseline = ref(computeBaseline())

  function computeBaseline(): string {
    return snapshot({
      contentData: article.value.contentData ?? {},
      title: article.value.title,
      excerpt: article.value.excerpt ?? null,
      slug: article.value.slug,
      seo: article.value.seo ?? {},
      featuredImageId: article.value.featuredImageId ?? null,
    })
  }

  function currentSnapshot(): string {
    return snapshot({
      contentData: draftContentData.value,
      title: draftTitle.value,
      excerpt: draftExcerpt.value,
      slug: draftSlug.value,
      seo: draftSeo.value,
      featuredImageId: draftFeaturedImageId.value,
    })
  }

  // Re-seed when the underlying article identity changes (route nav between
  // articles) — never silently overwrite an in-progress draft for the SAME id.
  watch(
    () => article.value.id,
    (newId, oldId) => {
      if (newId === oldId) return
      reseedFromArticle()
    },
  )

  function reseedFromArticle() {
    draftContentData.value = clone(article.value.contentData ?? {})
    draftTitle.value = clone(article.value.title)
    draftExcerpt.value = clone(article.value.excerpt ?? null)
    draftSlug.value = article.value.slug
    draftSeo.value = clone(article.value.seo ?? {})
    draftFeaturedImageId.value = article.value.featuredImageId ?? null
    draftTemplateSettings.value = clone(article.value.templateSettings ?? null)
    hasUnpublishedChanges.value = article.value.hasUnpublishedChanges ?? false
    baseline.value = computeBaseline()
    saveState.value = 'idle'
    saveError.value = null
    validationErrors.value = {}
    publishState.value = 'idle'
    publishError.value = null
    // Discarding drafts must discard the pending save with them, or the store
    // would later flush a request built from edits the caller just threw away.
    discardPendingSave()
  }

  // ── Save state ─────────────────────────────────────────────────────────────
  const saveState = ref<SaveState>('idle')
  const lastSavedAt = ref<Date | null>(null)
  const saveError = ref<string | null>(null)
  const validationErrors = ref<Record<string, string[]>>({})

  const isDirty = computed(() => currentSnapshot() !== baseline.value)

  // ── Publish state ──────────────────────────────────────────────────────────
  const publishState = ref<PublishState>('idle')
  const publishError = ref<string | null>(null)

  /**
   * Does the live public revision lag the draft?
   *
   * Articles are served publicly from the immutable `articlePublications`
   * snapshot — a deliberate contract (`docs/reviews/published-visible-plan.md`)
   * so a `_draft` edit, `requireAuth` included, cannot change the public page
   * behind the author's back. The cost is that "Published" alone is a lie after
   * any save. We seed from the server's answer at load and then keep it honest
   * locally: every successful write sets it, a successful publish clears it.
   *
   * Unpublishing clears it too — with no public revision there is nothing to be
   * stale against, and the Publish button already carries the call to action.
   */
  const hasUnpublishedChanges = ref<boolean>(article.value.hasUnpublishedChanges ?? false)

  /** Any out-of-band write to this article (e.g. a template-settings save). */
  function markUnpublishedChanges(): void {
    hasUnpublishedChanges.value = true
  }

  /**
   * Can the user click Publish?
   * - Not currently saving / publishing
   * - Not dirty (publish flow auto-saves first; we still expose this as "ready
   *   to publish" — the page can choose whether to gate the button)
   *
   * Callers that want a "Save & Publish" button can ignore `isDirty` and
   * rely on `publish()`'s internal save chain.
   */
  const canPublish = computed(() => (
    saveState.value !== 'saving'
    && publishState.value !== 'publishing'
    && publishState.value !== 'unpublishing'
  ))

  // ── Save ───────────────────────────────────────────────────────────────────
  //
  // `editorChangeStore` owns scheduling, debouncing, flush-before-navigate and
  // the global status pill; this function owns only the request and the
  // baseline bookkeeping. Both the full-page editor and ArticleSettingsPanel
  // now run through the same `article:<id>` lane, so they cannot report
  // different saved states for the same article (I7).
  async function runPut(): Promise<SaveResult> {
    saveState.value = 'saving'
    saveError.value = null
    validationErrors.value = {}

    // Capture the snapshot we're about to PUT so we can update the baseline
    // to reflect WHAT WAS SENT. If the user types during the in-flight save,
    // the post-save baseline must NOT include those new changes — otherwise
    // we'd silently treat un-sent edits as saved.
    const inFlightSnapshot = currentSnapshot()
    const body = buildPutBody()

    try {
      await adminFetch(
        `/api/admin/s/${siteId.value}/${kind}/${articleId.value}`,
        { method: 'PUT', body },
      )
      // Success — baseline = what we just sent. If the draft has diverged
      // (user typed during save), `isDirty` recomputes to true and the
      // follow-up autosave kicks in below.
      baseline.value = inFlightSnapshot
      saveState.value = 'saved'
      lastSavedAt.value = new Date()
      // The draft row moved ahead of whatever the public snapshot holds.
      markUnpublishedChanges()
      onSaved?.()
      // Reset to idle after a short window so the "Saved" indicator fades.
      scheduleSavedReset()
      // If the user typed during the save, isDirty is now true again on the new
      // baseline — kick off another autosave window.
      if (autosave && isDirty.value) scheduleAutosave()
      return { ok: true }
    } catch (err) {
      const status = extractStatus(err)
      const message = extractErrorMessage(err)
      saveState.value = 'error'
      saveError.value = message
      if (status === 400) {
        validationErrors.value = parseValidationErrors(message)
      }
      onError?.(err)
      return { ok: false, errors: validationErrors.value }
    }
  }

  function buildPutBody(): Record<string, unknown> {
    // The PUT endpoint silently strips templateSettings/templateId/pageType.
    // We send only fields the user can edit on this surface.
    //
    // TODO 2.D.6 polish: an admin `switchTemplate(templateId)` action would
    // call `PUT /articles/:id/template` (admin-only) — preserves contentData,
    // resets templateSettings to the new template's defaults, bumps
    // templateVersion. UI shipped lazily; the endpoint is live.
    return {
      contentData: draftContentData.value,
      title: draftTitle.value,
      excerpt: draftExcerpt.value,
      slug: draftSlug.value,
      seo: draftSeo.value,
      featuredImageId: draftFeaturedImageId.value,
    }
  }

  let savedResetTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSavedReset() {
    if (savedResetTimer) clearTimeout(savedResetTimer)
    savedResetTimer = setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
      savedResetTimer = null
    }, SAVED_RESET_MS)
  }

  // ── Publish / unpublish ───────────────────────────────────────────────────
  async function publish(): Promise<PublishResult> {
    // Blog-index pages don't have publish/unpublish endpoints in V2; they
    // flip live via the generic site-publish flow. Saving still writes the
    // draft; the host page can suppress the publish button entirely.
    if (isBlog) {
      if (isDirty.value) {
        const saveRes = await save()
        if (!saveRes.ok) return { ok: false, reason: 'save_failed' }
      }
      return { ok: true }
    }
    if (isDirty.value) {
      const saveRes = await save()
      if (!saveRes.ok) return { ok: false, reason: 'save_failed' }
    }
    publishState.value = 'publishing'
    publishError.value = null
    try {
      await adminFetch(
        `/api/admin/s/${siteId.value}/${kind}/${articleId.value}/publish`,
        { method: 'POST' },
      )
      publishState.value = 'published'
      // The snapshot was just rebuilt from this draft row — back in sync.
      hasUnpublishedChanges.value = false
      onPublished?.()
      return { ok: true }
    } catch (err) {
      publishState.value = 'error'
      publishError.value = extractErrorMessage(err)
      onError?.(err)
      return { ok: false, reason: 'request_failed' }
    }
  }

  async function unpublish(): Promise<{ ok: boolean }> {
    if (isBlog) return { ok: true }
    publishState.value = 'unpublishing'
    publishError.value = null
    try {
      await adminFetch(
        `/api/admin/s/${siteId.value}/${kind}/${articleId.value}/unpublish`,
        { method: 'POST' },
      )
      publishState.value = 'unpublished'
      // No public revision left, so nothing can lag it.
      hasUnpublishedChanges.value = false
      onUnpublished?.()
      return { ok: true }
    } catch (err) {
      publishState.value = 'error'
      publishError.value = extractErrorMessage(err)
      onError?.(err)
      return { ok: false }
    }
  }

  // ── Autosave, owned by editorChangeStore ───────────────────────────────────
  //
  // This used to be a private setTimeout with its own in-flight and error
  // handling. The store already provides debouncing, single-flight per key,
  // flush-before-navigate and error retention, and — unlike a local timer —
  // it makes unsaved article work visible to the global save status and to
  // every navigation guard.
  const changes = useEditorChangeStore()
  const saveKey = computed(() => editorChangeKey.article(articleId.value))
  const saveScope = computed(() => editorChangeScope.page(articleId.value))

  /** Result of the most recent run, for callers that want the detail. */
  let lastResult: SaveResult = { ok: true }

  async function runQueuedSave(): Promise<void> {
    // The debounce window is long enough for the author to undo their edit.
    // Without this the store would flush a no-op PUT over a clean article.
    if (!isDirty.value) {
      lastResult = { ok: true }
      return
    }
    lastResult = await runPut()
    // Surface failure to the store so the job is retained, marked in error and
    // offered for retry. Swallowing it here would show "Saved" over a failure.
    if (!lastResult.ok) throw new Error(saveError.value ?? 'Article save failed')
  }

  function queueSave(delay: number) {
    changes.queue({
      key: saveKey.value,
      surface: 'article',
      scope: saveScope.value,
      delay,
      label: 'Article',
      run: runQueuedSave,
    })
  }

  function scheduleAutosave() {
    if (!autosave) return
    queueSave(AUTOSAVE_DELAY_MS)
  }

  function discardPendingSave() {
    changes.discardJob(saveKey.value)
  }

  /**
   * Manual save. Queues with no delay and flushes immediately, so a manual save
   * and a pending autosave can never run as two concurrent requests.
   */
  async function save(): Promise<SaveResult> {
    queueSave(0)
    await changes.flushJob(saveKey.value, true)
    return lastResult
  }

  // Watch all draft surfaces. `deep: true` so contentData object mutations fire.
  watch(
    [draftContentData, draftTitle, draftExcerpt, draftSlug, draftSeo, draftFeaturedImageId],
    () => {
      if (!isDirty.value) return
      scheduleAutosave()
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    // Flush rather than discard: leaving the editor inside the debounce window
    // used to silently drop up to two seconds of edits.
    void changes.flushJob(saveKey.value)
    if (savedResetTimer) clearTimeout(savedResetTimer)
  })

  return {
    // draft state
    draftContentData,
    draftTitle,
    draftExcerpt,
    draftSlug,
    draftSeo,
    draftFeaturedImageId,
    draftTemplateSettings,
    // status
    isDirty,
    saveState,
    lastSavedAt,
    saveError,
    validationErrors,
    publishState,
    publishError,
    canPublish,
    hasUnpublishedChanges,
    // actions
    save,
    publish,
    unpublish,
    /**
     * Record an out-of-band write to this article (template settings save the
     * settings panel owns) so the header can offer a republish.
     */
    markUnpublishedChanges,
    /**
     * Destructive — reseeds drafts from the current `article` ref, clears
     * validation errors, and resets save/publish state to idle. Call only when
     * discarding any pending edits is intended (e.g. after route nav between
     * sibling articles, or a forced parent refetch).
     */
    reseedFromArticle,
  }
}

export type UseArticleEditorReturn = ReturnType<typeof useArticleEditor>
