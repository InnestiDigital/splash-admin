<template>
  <div class="bfs">
    <div v-if="store.templatesError" class="bfs__error" role="alert">{{ store.templatesError }}</div>
    <div v-for="warning in store.warnings" :key="warning" class="bfs__warning" role="status">{{ warning }}</div>

    <!-- ── The visual Brand Identity preset used by preview + generation ───── -->
    <section class="bfs__preset bfs__surface">
      <div class="bfs__section-heading">
        <span class="bfs__step" aria-hidden="true">01</span>
        <div class="bfs__section-copy">
          <h2 class="bfs__section-title">{{ t('admin.brand.brandContext', 'Set the brand context') }}</h2>
          <p class="bfs__section-description">{{ t('admin.brand.brandContextDescription', 'File this asset under the right brand direction.') }}</p>
        </div>
      </div>
      <div class="bfs__preset-control">
        <label class="bfs__preset-label" for="bfs-preset">{{ t('admin.brand.brandPreset', 'Brand preset') }}</label>
        <select
          id="bfs-preset"
          class="cms-form-control bfs__preset-select"
          :value="store.activePresetId ?? ''"
          :disabled="store.presets.length <= 1"
          @change="onPresetChange"
        >
          <option v-if="store.presets.length === 0" value="">{{ t('admin.brand.siteDefault', 'Site default') }}</option>
          <option v-for="preset in store.presets" :key="preset.presetId" :value="preset.presetId">
            {{ preset.presetName }}
          </option>
        </select>
      </div>
      <p class="bfs__preset-hint">
        Logo and semantic brand roles come from this preset. The saved recipe keeps the
        same preset so reopening it reproduces the visual direction.
      </p>
      <p v-if="store.presetsError" class="bfs__error" role="alert">{{ store.presetsError }}</p>
    </section>

    <!-- ── The pickable set: this site's approved canvases ──────────────────── -->
    <p v-if="store.templatesLoading" class="bfs__loading">{{ t('admin.brand.loadingCanvases', 'Loading approved canvases…') }}</p>

    <section v-else-if="store.templates.length > 0" class="bfs__gallery bfs__surface" :aria-label="t('admin.brand.approvedCanvases', 'Approved canvases')">
      <div class="bfs__section-heading">
        <span class="bfs__step" aria-hidden="true">02</span>
        <div class="bfs__section-copy">
          <h2 class="bfs__section-title">{{ t('admin.brand.chooseCanvas', 'Choose a canvas') }}</h2>
          <p class="bfs__section-description">{{ t('admin.brand.chooseCanvasDescription', 'Only approved canvases are available for generation.') }}</p>
        </div>
        <span class="cms-badge cms-badge--neutral bfs__gallery-count">{{ store.templates.length }}</span>
      </div>
      <ul class="bfs__gallery-strip">
        <li v-for="row in store.templates" :key="row.id" class="bfs__gallery-item">
          <button
            type="button"
            class="bfs__card"
            :class="{ 'bfs__card--active': selectedTemplateId === row.id }"
            :aria-current="selectedTemplateId === row.id ? 'true' : undefined"
            @click="chooseTemplate(row.id)"
          >
            <span class="bfs__card-visual-wrap">
              <span
                class="bfs__card-visual"
                :style="thumbnailFrameStyle(row.width, row.height)"
                aria-hidden="true"
              >
                <!-- Newest saved render as the thumbnail; without one the
                     aspect-ratio ghost stays, honest about "never rendered". -->
                <img
                  v-if="store.templateThumbs[row.id]"
                  :src="store.templateThumbs[row.id]"
                  alt=""
                  class="bfs__card-thumb"
                  loading="lazy"
                >
              </span>
            </span>
            <span class="bfs__card-copy">
              <span class="bfs__card-label">{{ row.name }}</span>
              <span class="bfs__card-meta">
                <span class="bfs__card-size">{{ row.width }}×{{ row.height }}</span>
                <span class="bfs__card-version">Approved v{{ row.version }}</span>
              </span>
            </span>
            <span v-if="selectedTemplateId === row.id" class="material-icons-outlined bfs__card-check" aria-hidden="true">check</span>
          </button>
        </li>
      </ul>
    </section>

    <!--
      Empty state. A canvas is authored on the Brand canvases page and becomes
      offerable here only once it is approved, so the only honest next step is a
      link there — for the roles that may open it. A client cannot author or
      approve a canvas, so pointing them at a page they would be refused would be
      a dead end; they are told who to ask instead.
    -->
    <section v-else-if="!store.templatesError" class="bfs__empty">
      <h3 class="bfs__empty-title">{{ t('admin.brand.noCanvases', 'No approved canvases yet') }}</h3>
      <template v-if="canAuthorCanvases">
        <p class="bfs__empty-copy">
          A canvas is a page you compose in the editor; approving it snapshots what
          it looks like, and only then can assets be generated from it.
        </p>
        <NuxtLink class="cms-btn cms-btn--primary" :to="canvasesUrl">{{ t('admin.brand.goToCanvases', 'Go to brand canvases') }}</NuxtLink>
      </template>
      <p v-else class="bfs__empty-copy">
        Nothing has been approved for this site yet. Ask the team that maintains
        this website to approve a canvas — it will show up here.
      </p>
    </section>

    <!-- ── The workspace: the approved canvas, its fields, scale and save ───── -->
    <section v-if="selectedTemplate" class="bfs__workspace">
      <div class="bfs__section-heading bfs__section-heading--workspace">
        <span class="bfs__step" aria-hidden="true">03</span>
        <div class="bfs__section-copy">
          <h2 class="bfs__section-title">{{ t('admin.brand.customize', 'Customize and export') }}</h2>
          <p class="bfs__section-description">{{ t('admin.brand.customizeDescription', 'Edit this render without changing the approved canvas.') }}</p>
        </div>
      </div>
      <BrandTemplateAssetWorkspace
        :key="selectedTemplate.id"
        :template="selectedTemplate"
        :draft="selectedDraft"
        @update:draft="cacheDraft"
      />
    </section>

    <!-- ── Assign the saved asset as a page's OG image ──────────────────────── -->
    <div v-if="store.savedAsset && canAssignOgImage" class="bfs__assign">
      <span class="material-icons-outlined bfs__assign-icon" aria-hidden="true">share</span>
      <div class="bfs__assign-copy">
        <strong>{{ t('admin.brand.useOnPage', 'Use the saved render on a page') }}</strong>
        <span>{{ t('admin.brand.sharingImage', 'Assign it as an Open Graph sharing image.') }}</span>
      </div>
      <div class="bfs__assign-controls">
        <label class="bfs__assign-label" for="bfs-assign-page">{{ t('admin.brand.page', 'Page') }}</label>
        <select
          id="bfs-assign-page"
          v-model="assignPageId"
          class="cms-form-control bfs__assign-select"
          :disabled="store.pagesLoading || store.assignStatus === 'assigning'"
        >
          <option value="">{{ store.pagesLoading ? 'Loading pages…' : 'Choose a page…' }}</option>
          <option v-for="page in store.pages" :key="page.id" :value="page.id">
            {{ page.label }} — /{{ page.slug }}
          </option>
        </select>
        <button
          type="button"
          class="cms-btn cms-btn--primary"
          :disabled="!assignPageId || store.assignStatus === 'assigning'"
          @click="assignAsOgImage"
        >
          {{ store.assignStatus === 'assigning' ? 'Assigning…' : 'Assign' }}
        </button>
      </div>
      <p v-if="ogSizeHint" class="bfs__assign-hint">{{ ogSizeHint }}</p>
      <p v-if="store.pagesError" class="bfs__assign-error" role="alert">{{ store.pagesError }}</p>
      <p v-if="store.assignError" class="bfs__assign-error" role="alert">{{ store.assignError }}</p>
      <p v-if="store.assignStatus === 'assigned' && store.assignedPage" class="bfs__assign-ok" role="status">
        Set as the OG image for <strong>{{ store.assignedPage.label }}</strong>. Publish the site for
        it to reach the live page.
      </p>
    </div>

    <!-- ── Per-canvas generation history ────────────────────────────────────── -->
    <section v-if="selectedTemplate" class="bfs__history">
      <div class="bfs__history-heading">
        <span class="material-icons-outlined" aria-hidden="true">history</span>
        <h3 class="bfs__history-title">
          Saved renders of <strong>{{ selectedTemplate.name }}</strong>
        </h3>
      </div>
      <BrandGenerationStrip
        :rows="generationRows"
        :loading="templateStore.generationsLoading"
        :error="templateStore.generationsError"
        empty-copy="Nothing saved from this canvas yet. “Save render to library” keeps the image and remembers the settings that made it."
      >
        <template #badge="{ row }">
          <span class="bfs__history-version">v{{ row.templateVersion }}</span>
          <span :class="`bfs__history-state bfs__history-state--${row.__state}`">{{ stateLabel(row) }}</span>
        </template>
      </BrandGenerationStrip>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useBrandFormatStore } from '~/admin/stores/brandFormatStore'
import { useBrandTemplateStore, type BrandTemplateGenerationState } from '~/admin/stores/brandTemplateStore'
import { useAuthStore } from '~/admin/stores/authStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import BrandTemplateAssetWorkspace, {
  type BrandAssetDraftState,
} from '~/admin/components/editor/BrandTemplateAssetWorkspace.vue'
import BrandGenerationStrip from '~/admin/components/editor/BrandGenerationStrip.vue'
import type { BrandTemplateGenerationRecord } from '~/shared/types/brandRender'
import { isRecord } from '~/shared/types/guards'

/**
 * Create assets — the CANVAS studio.
 *
 * One tier, one flow: pick an approved canvas, fill the fields its blocks
 * expose (a curated subset for a client session — `BrandTemplateAssetWorkspace`
 * owns that filter), pick a scale, save the render to the media library, and
 * optionally point a page's OG image at it. The compiled-format tier that used
 * to share this panel — a catalog of `*.format.json` descriptors, the composer
 * and the whole-set campaign — is retired; AI composition returns later as an
 * author against canvas overrides.
 */

const store = useBrandFormatStore()
const { t } = useAdminI18n()
const templateStore = useBrandTemplateStore()
const auth = useAuthStore()
const { adminUrl } = useAdminUrl()
const route = useRoute()
const selectedTemplateId = ref<string | null>(null)
const handledTemplateRequest = ref<string | null>(null)

// ── Forgiving per-canvas drafts ──────────────────────────────────────────────

/** Site scope prevents equal template ids in two tenants from sharing a draft. */
function draftKey(siteId: string, templateId: string): string {
  return `${siteId}::${templateId}`
}

function emptyDraft(siteId: string, templateId: string): BrandAssetDraftState {
  return {
    siteId,
    templateId,
    overrides: {},
    savedBaseline: {},
    validationErrors: {},
  }
}

const draftsByTemplate = ref<Record<string, BrandAssetDraftState>>({})

function sameDraftValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => sameDraftValue(entry, b[index]))
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every(key => Object.hasOwn(b, key) && sameDraftValue(a[key], b[key]))
  }
  return false
}

function draftIsDirty(draft: BrandAssetDraftState): boolean {
  return !sameDraftValue(draft.overrides, draft.savedBaseline)
}

const selectedDraft = computed<BrandAssetDraftState>(() => {
  const siteId = store.siteId ?? ''
  const templateId = selectedTemplateId.value ?? ''
  return draftsByTemplate.value[draftKey(siteId, templateId)]
    ?? emptyDraft(siteId, templateId)
})

function cacheDraft(draft: BrandAssetDraftState): void {
  draftsByTemplate.value = {
    ...draftsByTemplate.value,
    [draftKey(draft.siteId, draft.templateId)]: draft,
  }
}

const dirtyDrafts = computed(() =>
  Object.values(draftsByTemplate.value).filter(draftIsDirty),
)

function confirmDiscardUnsavedDrafts(): boolean {
  const count = dirtyDrafts.value.length
  if (count === 0) return true
  return window.confirm(
    `Discard unsaved asset edits for ${count} ${count === 1 ? 'canvas' : 'canvases'}?`,
  )
}

// Confirm, but do not mutate the drafts here. Another route guard can still
// cancel after this one returns; successful navigation unmounts the component
// and naturally releases its local cache, while cancellation must preserve it.
onBeforeRouteLeave(() => {
  if (!confirmDiscardUnsavedDrafts()) return false
})

// Nuxt can reuse this component while only the program/site params change.
// Guard that path too; a route-leave hook alone does not always see it.
onBeforeRouteUpdate(() => {
  if (!confirmDiscardUnsavedDrafts()) return false
})

// A successful same-component update does not unmount this local cache. Wait
// for the reactive route to commit before clearing it; if another guard cancels
// the navigation, `fullPath` never changes and every draft remains intact.
watch(
  () => route.fullPath,
  () => { draftsByTemplate.value = {} },
)

function beforeUnloadHandler(event: BeforeUnloadEvent): void {
  if (dirtyDrafts.value.length === 0) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', beforeUnloadHandler))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnloadHandler))

// ── Picking an approved canvas ───────────────────────────────────────────────

const THUMBNAIL_FRAME_SIZE = 74

/** Preserve the real canvas ratio inside the square picker slot. */
function thumbnailFrameStyle(width: number, height: number): Record<string, string> {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const ratio = safeWidth / safeHeight
  const frameWidth = ratio >= 1 ? THUMBNAIL_FRAME_SIZE : THUMBNAIL_FRAME_SIZE * ratio
  const frameHeight = ratio >= 1 ? THUMBNAIL_FRAME_SIZE / ratio : THUMBNAIL_FRAME_SIZE
  return {
    width: `${Math.max(1, Math.round(frameWidth))}px`,
    height: `${Math.max(1, Math.round(frameHeight))}px`,
    aspectRatio: `${safeWidth} / ${safeHeight}`,
  }
}

/**
 * Declared up here, not down with the rest of the OG assignment, because
 * `chooseTemplate` clears it and the auto-open watch below runs `chooseTemplate`
 * during setup — a later `const` would be in its temporal dead zone.
 */
const assignPageId = ref('')

/**
 * Resolved against the LIVE list rather than held as a copy, so a canvas
 * un-approved or deleted in another tab simply stops resolving instead of
 * keeping a stale workspace open over content nobody approved.
 */
const selectedTemplate = computed(
  () => store.templates.find(row => row.id === selectedTemplateId.value) ?? null,
)

function chooseTemplate(id: string): void {
  if (selectedTemplateId.value === id) return
  selectedTemplateId.value = id
  // The saved-asset banner and the assignment receipt describe the canvas the
  // author just left — a receipt naming another canvas's asset is a lie about
  // this one.
  store.resetSaveReceipt()
  store.resetAssignment()
  assignPageId.value = ''
}

/**
 * Open the first canvas as soon as the list lands. The picker is the page's
 * front door and a single approved canvas is the common case — making the
 * author click once before anything appears buys nothing.
 */
watch(
  [() => store.templates, () => route.query.templateId],
  ([rows, requestedValue]) => {
    const requested = typeof requestedValue === 'string' ? requestedValue : ''
    if (!requested) handledTemplateRequest.value = null
    if (
      requested
      && requested !== handledTemplateRequest.value
      && rows.some(row => row.id === requested)
    ) {
      handledTemplateRequest.value = requested
      if (selectedTemplateId.value !== requested) chooseTemplate(requested)
      return
    }
    const selectionStillExists = rows.some(row => row.id === selectedTemplateId.value)
    const firstTemplate = rows[0]
    if (!selectionStillExists && firstTemplate) chooseTemplate(firstTemplate.id)
    if (rows.length === 0) selectedTemplateId.value = null
  },
  { immediate: true },
)

/**
 * Load the open canvas's render history the moment it is picked.
 * `loadGenerations` owns the "already loaded" cache, so switching back to a
 * canvas visited earlier this session skips the round trip.
 */
watch(
  selectedTemplateId,
  (id) => { if (id) void templateStore.loadGenerations(id) },
  { immediate: true },
)

// ── The preset stamp ─────────────────────────────────────────────────────────

/**
 * Switching the preset re-files the NEXT generation; it reloads nothing,
 * because nothing on this page is preset-scoped any more — a canvas paints
 * with the site's live theme whatever preset the recipe names.
 */
function onPresetChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  store.setActivePreset(target.value.length > 0 ? target.value : null)
}

// ── Generation history ───────────────────────────────────────────────────────

/** A history row plus the pin state, flattened so the strip's `#badge` slot can read it. */
interface GenerationRow extends BrandTemplateGenerationRecord {
  __state: BrandTemplateGenerationState
  __currentVersion: number | null
}

const generationRows = computed<GenerationRow[]>(() =>
  templateStore.generationCards.map(card => ({
    ...card.record,
    __state: card.state,
    __currentVersion: card.currentVersion,
  })),
)

/** Same wording `BrandTemplateGalleryStrip` uses — one state, one label. */
function stateLabel(row: GenerationRow): string {
  if (row.__state === 'orphaned') return 'canvas deleted'
  if (row.__state === 'stale') return `stale — now v${row.__currentVersion}`
  return 'current'
}

// ── Empty state ──────────────────────────────────────────────────────────────

/**
 * Authoring and approving a canvas is admin-only (the Brand canvases page and
 * every write behind it), so only those roles get the deep link.
 */
const canAuthorCanvases = computed(() => auth.user?.role === 'admin')
const canvasesUrl = computed(() => adminUrl('/brand/canvases'))

// ── Assign the saved asset as a page's OG image ──────────────────────────────

/**
 * Only an admin may WRITE a page — `PUT /pages/:id` is denied by RBAC for
 * 'client' (whitelist) and 'editor' (EDITOR_WRITE_BLOCKED_PATTERNS) alike —
 * so offering the assignment to those roles would be a button that always
 * 403s. The whole block is hidden for them instead.
 */
const canAssignOgImage = computed(() => auth.user?.role === 'admin')

/** The page list is only worth fetching once an asset exists to assign. */
watch(() => store.savedAsset, (asset) => {
  if (asset && canAssignOgImage.value) void store.loadPages()
})

/**
 * OG is 1200×630, and a canvas's size is its own — the approved row's, not a
 * format descriptor's. Another aspect ratio still assigns (social platforms
 * crop rather than refuse) but the author should know before they wonder why
 * the card looks trimmed.
 */
const ogSizeHint = computed<string | null>(() => {
  const template = selectedTemplate.value
  if (!template) return null
  if (template.width === 1200 && template.height === 630) return null
  return `This canvas is ${template.width}×${template.height}; social cards are cropped to 1200×630.`
})

async function assignAsOgImage(): Promise<void> {
  await store.assignSavedAssetToPage(assignPageId.value)
  // store.assignError / store.assignedPage are already rendered — nothing to add.
}
</script>

<style scoped>
.bfs {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-5, 24px);
}

.bfs__loading {
  margin: 0;
  padding: var(--cms-sp-5, 24px);
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface);
  font-size: var(--cms-fs-sm, 13px);
}

.bfs__error,
.bfs__warning {
  margin: 0;
  padding: var(--cms-sp-3, 12px) var(--cms-sp-4, 16px);
  border: 1px solid transparent;
  border-radius: var(--cms-radius-control, 6px);
  font-size: var(--cms-fs-sm, 13px);
  line-height: 1.45;
}

.bfs__error {
  border-color: rgba(158, 43, 37, 0.24);
  color: var(--cms-danger, var(--cms-danger));
  background: var(--cms-danger-soft, var(--cms-danger-soft));
}

.bfs__warning {
  border-color: rgba(178, 106, 18, 0.24);
  color: var(--cms-warn);
  background: var(--cms-warn-soft);
}

.bfs__surface {
  padding: var(--cms-sp-4, 16px);
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
}

.bfs__section-heading {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-3, 12px);
  min-width: 0;
}

.bfs__section-heading--workspace {
  margin-bottom: var(--cms-sp-4, 16px);
}

.bfs__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(46, 125, 50, 0.22);
  border-radius: 9px;
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  font-size: 11px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.bfs__section-copy {
  min-width: 0;
}

.bfs__section-title {
  margin: 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-lg, 16px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.bfs__section-description {
  margin: 2px 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}

/* ── The recipe stamp ─────────────────────────────────────────────────────── */
.bfs__preset {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(220px, 320px);
  align-items: center;
  gap: var(--cms-sp-3, 12px) var(--cms-sp-5, 24px);
}

.bfs__preset-control {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--cms-sp-2, 8px);
}

.bfs__preset-label,
.bfs__assign-label {
  margin: 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
}

.bfs__preset-select {
  max-width: 320px;
}

.bfs__preset-hint {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: var(--cms-sp-3, 12px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.5;
}

/* ── Approved-canvas picker ───────────────────────────────────────────────── */
.bfs__gallery-count {
  margin-left: auto;
}

.bfs__gallery-strip {
  display: flex;
  gap: var(--cms-sp-3, 12px);
  overflow-x: auto;
  list-style: none;
  margin: var(--cms-sp-4, 16px) calc(var(--cms-sp-1, 4px) * -1) 0;
  padding: 0 var(--cms-sp-1, 4px) var(--cms-sp-2, 8px);
  scroll-snap-type: x proximity;
  scrollbar-color: var(--cms-line-strong, var(--cms-line-strong)) transparent;
}

.bfs__gallery-item {
  display: flex;
  flex: 0 0 auto;
  scroll-snap-align: start;
}

.bfs__card {
  position: relative;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: center;
  gap: var(--cms-sp-3, 12px);
  width: 218px;
  min-height: 100px;
  padding: var(--cms-sp-3, 12px);
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .bfs__card:hover {
    border-color: var(--cms-line-hover, var(--cms-line-hover));
    box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
  }
}

.bfs__card:active {
  transform: scale(0.985);
}

.bfs__card--active {
  border-color: var(--cms-accent, var(--cms-accent));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
  box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.bfs__card-visual-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 74px;
  height: 74px;
}

.bfs__card-visual {
  display: block;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: 5px;
  background: repeating-conic-gradient(var(--cms-surface-subtle, var(--cms-surface-subtle)) 0% 25%, var(--cms-surface) 0% 50%) 50% / 12px 12px;
  box-shadow: 0 1px 3px rgba(33, 30, 25, 0.08);
}

.bfs__card-thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.bfs__card-copy,
.bfs__card-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bfs__card-copy {
  gap: 7px;
}

.bfs__card-meta {
  gap: 2px;
}

.bfs__card-label {
  overflow: hidden;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bfs__card-size,
.bfs__card-version {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.bfs__card-check {
  position: absolute;
  top: 7px;
  right: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: var(--cms-ink-inverse, var(--cms-ink-inverse));
  background: var(--cms-accent, var(--cms-accent));
  font-size: 13px;
}

/* ── Workspace and empty state ────────────────────────────────────────────── */
.bfs__workspace {
  min-width: 0;
  container-type: inline-size;
}

.bfs__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--cms-sp-3, 12px);
  padding: var(--cms-sp-6, 32px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.bfs__empty-title {
  margin: 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-lg, 16px);
  font-weight: 700;
}

.bfs__empty-copy {
  max-width: 58ch;
  margin: 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-sm, 13px);
  line-height: 1.55;
}

/* ── OG assignment ────────────────────────────────────────────────────────── */
.bfs__assign {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) minmax(320px, 1.5fr);
  align-items: center;
  gap: var(--cms-sp-3, 12px);
  padding: var(--cms-sp-4, 16px);
  border: 1px solid rgba(46, 125, 50, 0.24);
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-accent-softest, var(--cms-accent-softest));
}

.bfs__assign-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-soft, var(--cms-accent-soft));
  font-size: 18px;
}

.bfs__assign-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
}

.bfs__assign-copy span {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
}

.bfs__assign-controls {
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr) auto;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
}

.bfs__assign-select {
  min-width: 0;
}

.bfs__assign-hint,
.bfs__assign-error,
.bfs__assign-ok {
  grid-column: 2 / -1;
  margin: 0;
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}

.bfs__assign-hint { color: var(--cms-ink-muted, var(--cms-ink-muted)); }
.bfs__assign-error { color: var(--cms-danger, var(--cms-danger)); }
.bfs__assign-ok { color: var(--cms-accent-pressed, var(--cms-accent-pressed)); }

/* ── Generation history — markup lives in BrandGenerationStrip; this panel
   only styles the badge slot content it supplies ────────────────────────── */
.bfs__history {
  padding-top: var(--cms-sp-5, 24px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
}

.bfs__history-heading {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  margin-bottom: var(--cms-sp-3, 12px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
}

.bfs__history-heading .material-icons-outlined {
  font-size: 18px;
}

.bfs__history-title {
  margin: 0;
  color: var(--cms-ink-body, var(--cms-ink-body));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 500;
}

.bfs__history-version {
  color: var(--cms-ink-body, var(--cms-ink-body));
  font-size: 11px;
  font-weight: 700;
}

.bfs__history-state {
  padding: 2px 6px;
  border-radius: var(--cms-radius-pill, 999px);
  font-size: 10px;
  font-weight: 650;
}

.bfs__history-state--current { background: var(--cms-ok-soft, var(--cms-accent-soft)); color: var(--cms-accent-pressed, var(--cms-accent-pressed)); }
.bfs__history-state--stale { background: var(--cms-warn-soft); color: var(--cms-warn); }
.bfs__history-state--orphaned { background: var(--cms-danger-soft, var(--cms-danger-soft)); color: var(--cms-danger, var(--cms-danger)); }

@container (max-width: 900px) {
  .bfs__preset,
  .bfs__assign {
    grid-template-columns: minmax(0, 1fr);
  }

  .bfs__assign-hint,
  .bfs__assign-error,
  .bfs__assign-ok {
    grid-column: 1;
  }
}

@container (max-width: 600px) {
  .bfs__surface {
    padding: var(--cms-sp-3, 12px);
  }

  .bfs__preset-control,
  .bfs__assign-controls {
    grid-template-columns: minmax(0, 1fr);
  }

  .bfs__preset-select {
    max-width: none;
  }
}
</style>
