<template>
  <div class="btw">
    <div class="btw__mobile-tabs" role="group" aria-label="Brand asset workspace pane">
      <button
        type="button"
        :class="{ 'btw__mobile-tab--active': compactPane === 'preview' }"
        :aria-pressed="compactPane === 'preview'"
        @click="compactPane = 'preview'"
      >
        <span class="material-icons-outlined" aria-hidden="true">visibility</span>
        Preview
      </button>
      <button
        type="button"
        :class="{ 'btw__mobile-tab--active': compactPane === 'edit' }"
        :aria-pressed="compactPane === 'edit'"
        @click="compactPane = 'edit'"
      >
        <span class="material-icons-outlined" aria-hidden="true">tune</span>
        Edit content
      </button>
    </div>

    <section class="btw__stage-col" :class="{ 'btw__pane--inactive': compactPane !== 'preview' }">
      <div class="btw__stage-shell">
        <header class="btw__stage-toolbar">
          <div class="btw__stage-identity">
            <span class="btw__stage-eyebrow">Live render</span>
            <strong>{{ template.name }}</strong>
            <span>{{ template.width }}×{{ template.height }}px · approved v{{ template.version }}</span>
          </div>
          <label class="btw__zoom">
            <span>Zoom</span>
            <select v-model="previewZoom" class="btw__zoom-select" aria-label="Preview zoom">
              <option value="fit">Fit width</option>
              <option value="50">50%</option>
              <option value="100">100%</option>
            </select>
          </label>
        </header>

        <div ref="frameEl" class="btw__frame">
          <div
            class="btw__viewport"
            :style="{
              width: `${scaledWidth}px`,
              height: `${scaledHeight}px`,
            }"
          >
            <!-- The same route Chromium exports, driven by the same approved
                 snapshot and override map. -->
            <iframe
              v-if="previewUrl"
              ref="previewFrame"
              class="btw__canvas"
              :src="previewUrl"
              :title="`Live preview of ${template.name}`"
              :style="{
                width: `${template.width}px`,
                height: `${template.height}px`,
                transform: `scale(${displayScale})`,
              }"
              @load="pushOverrides"
            />
            <p v-else class="btw__no-preview">
              No site is selected, so there is no canvas to preview.
            </p>
          </div>
        </div>
        <div class="btw__stage-footer">
          <span>Shown at {{ Math.round(displayScale * 100) }}%</span>
          <span class="btw__stage-footer-dot" aria-hidden="true">·</span>
          <!-- Brand canvases is an admin-only page — don't point other roles at it. -->
          <span>{{ auth.user?.role === 'admin' ? 'Edit the source on Brand canvases' : 'Approved content' }}</span>
        </div>
      </div>
      <p v-if="previewError" class="btw__error" role="alert">
        This canvas could not be rendered: {{ previewError }}
      </p>
      <p v-for="warning in previewWarnings" :key="warning" class="btw__warning" role="status">
        {{ warning }}
      </p>
    </section>

    <aside class="btw__form" :class="{ 'btw__pane--inactive': compactPane !== 'edit' }">
      <header class="btw__form-header">
        <div>
          <span class="btw__form-eyebrow">Asset content</span>
          <h3>Customize this render</h3>
          <p>Changes stay with this asset and never alter the approved canvas.</p>
        </div>
        <div class="btw__draft-tools">
          <span v-if="changedBlockCount" class="btw__changed-badge">
            {{ changedBlockCount }} customized
          </span>
          <button
            v-if="draftDirty"
            type="button"
            class="cms-btn cms-btn--ghost cms-btn--sm btw__discard"
            @click="discardDraft"
          >
            Discard edits
          </button>
        </div>
      </header>

      <div ref="formBodyEl" class="btw__form-body">
        <template v-if="editableBlocks.length && activeEntry">
          <label v-if="editableBlocks.length > 1" class="btw__block-picker" for="btw-block">
            <span>Content block</span>
            <select id="btw-block" v-model="activeBlockId" class="cms-form-control">
              <option v-for="entry in editableBlocks" :key="entry.block.id" :value="entry.block.id">
                {{ entry.label }}{{ blockOptionSuffix(entry.block.id) }}
              </option>
            </select>
          </label>

          <div :key="activeEntry.block.id" class="btw__block">
            <div class="btw__block-heading">
              <div>
                <span class="btw__block-overline">Editing</span>
                <h4 class="btw__block-label">{{ activeEntry.label }}</h4>
              </div>
              <button
                v-if="overrides[activeEntry.block.id]"
                type="button"
                class="cms-btn cms-btn--ghost cms-btn--sm btw__reset"
                @click="resetBlock(activeEntry.block.id)"
              >
                <span class="material-icons-outlined" aria-hidden="true">restart_alt</span>
                Reset
              </button>
            </div>
            <FormRenderer
              :schema="activeEntry.schema.settings"
              :groups="activeEntry.schema.groups"
              :model-value="settingsFor(activeEntry.block)"
              @update:model-value="onBlockSettings(activeEntry.block, $event)"
              @validity-change="onFormValidityChange"
            />
          </div>
          <p class="btw__hint">
            Unchanged fields keep their approved values. Switch blocks above to customize another part of the canvas.
          </p>
        </template>
        <p v-else-if="restricted" class="btw__hint btw__hint--empty">
          This template renders exactly as approved — there are no fields to change.
        </p>
        <p v-else class="btw__hint btw__hint--empty">
          This template's blocks have no editable settings in this theme — it renders exactly as approved.
        </p>

        <p v-if="skippedTypes.length && !restricted" class="btw__hint btw__hint--muted">
          No settings form for {{ skippedTypes.join(', ') }} — {{ skippedTypes.length === 1 ? 'that block renders' : 'those blocks render' }}
          as approved. Edit {{ skippedTypes.length === 1 ? 'it' : 'them' }} on the canvas page instead.
        </p>
      </div>

      <footer class="btw__actions">
        <div class="btw__export-row">
          <label class="btw__export-scale" for="btw-scale">
            <span>Export scale</span>
            <select id="btw-scale" v-model.number="scale" class="cms-form-control btw__scale">
              <option v-for="option in scaleOptions" :key="option" :value="option">{{ option }}×</option>
            </select>
          </label>
          <span class="btw__output-size">{{ template.width * scale }}×{{ template.height * scale }}px</span>
        </div>
        <button
          type="button"
          class="cms-btn cms-btn--primary btw__save"
          :disabled="store.saving || overridesTooLarge || !formValid || !previewCurrent"
          :aria-describedby="!formValid ? 'btw-validation-summary' : !previewCurrent ? 'btw-preview-status' : undefined"
          @click="save"
        >
          <span v-if="store.saving" class="cms-btn-spinner" aria-hidden="true" />
          <span v-else class="material-icons-outlined" aria-hidden="true">save_alt</span>
          {{ store.saving ? 'Saving render…' : 'Save render to library' }}
        </button>

        <p v-if="overridesTooLarge" class="btw__error" role="alert">
          These edits are too large to send with a render. Shorten the longest fields or reset unused blocks.
        </p>
        <p v-if="!formValid" id="btw-validation-summary" class="btw__error" role="alert">
          <button type="button" class="btw__validation-link" @click="focusFirstInvalidBlock">
            Fix {{ validationErrorCount }} invalid {{ validationErrorCount === 1 ? 'field' : 'fields' }} before saving this render.
          </button>
        </p>
        <p v-else-if="!previewCurrent" id="btw-preview-status" class="btw__hint" role="status">
          {{ previewError ? 'Resolve the preview error before saving.' : 'Updating the preview to match these edits…' }}
        </p>
        <p v-if="store.saveError" class="btw__error" role="alert">{{ store.saveError }}</p>
        <p v-if="store.savedAsset" class="btw__saved" role="status">
          <span class="material-icons-outlined" aria-hidden="true">check_circle</span>
          Saved as
          <a :href="store.savedAsset.url" target="_blank" rel="noopener">{{ store.savedAsset.filename }}</a>
        </p>
      </footer>
    </aside>
  </div>
</template>

<script lang="ts">
/**
 * Parent-owned asset draft. `savedBaseline` is the exact override recipe from
 * the latest successful export; keeping it separate lets Save clear the dirty
 * state without making the customization disappear from the preview.
 */
export interface BrandAssetDraftState {
  siteId: string
  templateId: string
  overrides: import('~/shared/types/brandCanvas').BrandCanvasOverrides
  savedBaseline: import('~/shared/types/brandCanvas').BrandCanvasOverrides
  validationErrors: Record<string, Record<string, string>>
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, toRaw, toRef, watch } from 'vue'
import FormRenderer from '~/admin/components/fields/FormRenderer.vue'
import { useAuthStore } from '~/admin/stores/authStore'
import { useBrandFormatStore } from '~/admin/stores/brandFormatStore'
import { useBrandTemplateStore } from '~/admin/stores/brandTemplateStore'
import { useTypographyStore } from '~/admin/stores/typographyStore'
import { useBrandCanvasPreview } from '~/admin/composables/useBrandCanvasPreview'
import { useCanvasBlockForms } from '~/admin/composables/useCanvasBlockForms'
import { BRAND_CANVAS_QUERY_KEYS, BRAND_CANVAS_ROUTE } from '~/shared/features/brand-studio/canvasRenderMode'
import { SETTINGS_RESOLUTION_LOCALE } from '~/shared/composables/useBlockSettings'
import { effectiveCuration, isSettingCurated } from '~/shared/features/brand-studio/curation'
import { isBrandCanvasOverrides } from '~/shared/types/brandCanvas'
import type { CanvasBlockForm } from '~/admin/composables/useCanvasBlockForms'
import type { BrandCanvasBlockSnapshot, BrandCanvasOverrides } from '~/shared/types/brandCanvas'
import type { BrandCanvasOverridesMessage } from '~/shared/types/previewMessages'
import { offerableRenderScales } from '~/shared/types/brandRender'
import type { BrandRenderScale } from '~/shared/types/brandRender'
import type { BrandTemplateRecord } from '~/shared/types/brandTemplate'
import { isRecord } from '~/shared/types/guards'

/**
 * The Create-assets workspace for an APPROVED canvas template.
 *
 * A template is a page of blocks, so its "fields" are the same block settings
 * the editor already knows how to render: this component walks the approved
 * SNAPSHOT, looks each block's type up in the theme's `*.settings.json`
 * schemas, and hands the schema to the ordinary `FormRenderer`. There is no
 * second field vocabulary to keep in sync, and an image field opens the same
 * media picker a block does.
 *
 * Edits become a per-generation OVERRIDE map keyed by block id — never a write
 * to the canvas page. The preview iframe is the very route Chromium
 * screenshots, fed the same map, so the approval and the export cannot drift.
 */
const props = defineProps<{
  template: BrandTemplateRecord
  draft: BrandAssetDraftState
}>()

const emit = defineEmits<{
  'update:draft': [draft: BrandAssetDraftState]
}>()

const store = useBrandFormatStore()
const templateStore = useBrandTemplateStore()
const typographyStore = useTypographyStore()
const auth = useAuthStore()

// ── Schemas: the admin's existing block-settings vocabulary ──────────────────

/**
 * The block-walk (snapshot order, schema lookup, labels, theme resolution) is
 * SHARED with the curation editor — see `useCanvasBlockForms`. The admin ticks
 * checkboxes against exactly the list rendered below, so a curated field always
 * corresponds to a control that exists.
 */
const { blocks, skippedTypes, schemas, themeManifest } = useCanvasBlockForms(toRef(props, 'template'))

/**
 * The locale override values are written under for translatable settings.
 *
 * NOT the theme's default locale: the canvas renderer resolves settings with
 * `SETTINGS_RESOLUTION_LOCALE` first (see `useBlockSettings` — DynamicPage
 * passes exactly this), so writing under any other key produces an override
 * the preview and the export silently ignore. Other locales get authored on
 * the canvas page itself, in the editor.
 */
const editingLocale = computed(() => SETTINGS_RESOLUTION_LOCALE)

/** What the field components inject — same keys `SettingsPanel` provides. */
provide('siteId', computed(() => store.siteId ?? ''))
provide('blockSchemas', schemas)
provide('themeManifest', themeManifest)
provide('editingLocale', editingLocale)
provide('typographyPresets', computed(() => typographyStore.typographyPresets))

// ── Curation: what a CLIENT account is allowed to change ─────────────────

/**
 * The template's allow-list, intersected against the approved snapshot in the
 * same record. The server already sends a client the intersected map (and
 * enforces it again on generate); doing it here too means the form cannot offer
 * a field even if a stale key survived somewhere upstream.
 */
const curated = computed(() => effectiveCuration(props.template.snapshot, props.template.customerSettings))

/**
 * Only a `client` session is restricted. Admins/editors curate and generate
 * without limits — curation is an instruction to customers, not to the people
 * who authored the template.
 */
const restricted = computed(() => auth.user?.role === 'client')

/**
 * A restricted session sees only curated blocks, and within them only curated
 * fields. The schema is COPIED with a filtered `settings` array rather than
 * mutated: `getBlockSchemas` hands back the theme's shared schema objects, and
 * trimming one in place would silently narrow the block editor everywhere else
 * in the admin for the rest of the session.
 */
const editableBlocks = computed<CanvasBlockForm[]>(() => {
  if (!restricted.value) return blocks.value
  return blocks.value
    .filter(entry => Object.hasOwn(curated.value, entry.block.id))
    .map(entry => ({
      ...entry,
      schema: {
        ...entry.schema,
        settings: entry.schema.settings.filter(
          field => isSettingCurated(curated.value, entry.block.id, field.id),
        ),
      },
    }))
    .filter(entry => entry.schema.settings.length > 0)
})

// One block at a time keeps the inspector short and gives its search field one
// unambiguous scope. Preserve the current choice while it remains offerable;
// otherwise move to the first block in snapshot order.
const activeBlockId = ref('')
const activeEntry = computed(() =>
  editableBlocks.value.find(entry => entry.block.id === activeBlockId.value)
  ?? editableBlocks.value[0]
  ?? null,
)

watch(editableBlocks, (entries) => {
  if (entries.some(entry => entry.block.id === activeBlockId.value)) return
  activeBlockId.value = entries[0]?.block.id ?? ''
}, { immediate: true })

const compactPane = ref<'preview' | 'edit'>('preview')

// ── Overrides: only what the author actually changed ─────────────────────────

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const overrides = ref<BrandCanvasOverrides>(cloneJson(props.draft.overrides))
const savedBaseline = ref<BrandCanvasOverrides>(cloneJson(props.draft.savedBaseline))
const validationErrors = ref<Record<string, Record<string, string>>>(cloneJson(props.draft.validationErrors))
const changedBlockCount = computed(() => Object.keys(overrides.value).length)
const draftDirty = computed(() => !isSameValue(overrides.value, savedBaseline.value))
const validationErrorCount = computed(() =>
  Object.values(validationErrors.value).reduce((total, errors) => total + Object.keys(errors).length, 0),
)
const formValid = computed(() => validationErrorCount.value === 0)

function blockOptionSuffix(blockId: string): string {
  if (validationErrors.value[blockId]) return ' · needs attention'
  return overrides.value[blockId] ? ' · changed' : ''
}

async function focusFirstInvalidBlock(): Promise<void> {
  const blockId = Object.keys(validationErrors.value)[0]
  if (!blockId) return
  activeBlockId.value = blockId
  await nextTick()
  formBodyEl.value?.querySelector<HTMLElement>(
    '[aria-invalid="true"], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
  )?.focus()
}

function publishDraft(): void {
  emit('update:draft', {
    siteId: props.draft.siteId,
    templateId: props.template.id,
    overrides: cloneJson(overrides.value),
    savedBaseline: cloneJson(savedBaseline.value),
    validationErrors: cloneJson(validationErrors.value),
  })
}

// Approval or curation can replace the editable tree while this workspace is
// mounted. Errors for controls that no longer exist must not strand Save in a
// permanently disabled state.
watch(editableBlocks, (entries) => {
  const available = new Set(entries.map(entry => entry.block.id))
  const nextErrors = Object.fromEntries(
    Object.entries(validationErrors.value).filter(([blockId]) => available.has(blockId)),
  )
  if (isSameValue(nextErrors, validationErrors.value)) return
  validationErrors.value = nextErrors
  publishDraft()
}, { immediate: true })

/**
 * A route guard in the parent can discard cached work even if another guard
 * ultimately cancels navigation. Rehydrate the mounted workspace so its
 * visible fields never disagree with the parent-owned draft.
 */
watch(() => props.draft, (draft) => {
  if (!isSameValue(overrides.value, draft.overrides)) overrides.value = cloneJson(draft.overrides)
  if (!isSameValue(savedBaseline.value, draft.savedBaseline)) savedBaseline.value = cloneJson(draft.savedBaseline)
  if (!isSameValue(validationErrors.value, draft.validationErrors)) {
    validationErrors.value = cloneJson(draft.validationErrors)
  }
}, { deep: true })

/** What the form shows: the approved settings with this generation's edits on top. */
function settingsFor(block: BrandCanvasBlockSnapshot): Record<string, unknown> {
  return { ...block.settings, ...overrides.value[block.id] }
}

/**
 * Structural equality, because a setting value is arbitrary authored JSON
 * (locale maps, richtext documents, item arrays). Identity alone would record
 * every field the form re-emitted as an override, and a serialized comparison
 * would call two equal objects different over key order.
 */
function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => isSameValue(entry, b[index]))
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every(key => Object.hasOwn(b, key) && isSameValue(a[key], b[key]))
  }
  return false
}

/**
 * `FormRenderer` emits the WHOLE settings map, so the delta is recomputed from
 * the approved values every time: an author who types over a field and then
 * types the approved value back leaves no override behind, and the recipe does
 * not record a change that changed nothing.
 */
function onBlockSettings(block: BrandCanvasBlockSnapshot, next: Record<string, unknown>): void {
  const changed: Record<string, unknown> = {}
  for (const [settingId, value] of Object.entries(next)) {
    // `FormRenderer` emits the whole settings map, including keys it rendered
    // no control for. A restricted session must not accumulate an override for
    // one of those: the server would answer 403 and the client would have no
    // field on screen to un-do.
    if (restricted.value && !isSettingCurated(curated.value, block.id, settingId)) continue
    if (!isSameValue(value, block.settings[settingId])) changed[settingId] = value
  }
  const nextOverrides: BrandCanvasOverrides = { ...overrides.value }
  if (Object.keys(changed).length === 0) delete nextOverrides[block.id]
  else nextOverrides[block.id] = changed
  overrides.value = nextOverrides
  publishDraft()
}

function resetBlock(blockId: string): void {
  const nextOverrides: BrandCanvasOverrides = { ...overrides.value }
  delete nextOverrides[blockId]
  overrides.value = nextOverrides
  const nextErrors = { ...validationErrors.value }
  delete nextErrors[blockId]
  validationErrors.value = nextErrors
  publishDraft()
}

function onFormValidityChange(valid: boolean, errors: Record<string, string>): void {
  const blockId = activeEntry.value?.block.id
  if (!blockId) return
  const normalized = Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].trim().length > 0),
  )
  const nextErrors = { ...validationErrors.value }
  if (valid || Object.keys(normalized).length === 0) delete nextErrors[blockId]
  else nextErrors[blockId] = normalized
  if (isSameValue(validationErrors.value, nextErrors)) return
  validationErrors.value = nextErrors
  publishDraft()
}

const formBodyEl = ref<HTMLElement | null>(null)

async function discardDraft(): Promise<void> {
  overrides.value = cloneJson(savedBaseline.value)
  validationErrors.value = {}
  publishDraft()
  await nextTick()
  const focusTarget = formBodyEl.value?.querySelector<HTMLElement>(
    'select:not(:disabled), input:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
  )
  focusTarget?.focus()
}

/**
 * Detached from Vue's proxies (postMessage cannot clone one) AND parsed with
 * the wire guard, which is where the block-count and payload-size caps live.
 * `null` therefore means both "not serializable" and "over the caps" — the two
 * cases the save endpoint would reject, so the button refuses first.
 */
function serializableOverrides(): BrandCanvasOverrides | null {
  const detached: unknown = JSON.parse(JSON.stringify(toRaw(overrides.value)))
  return isBrandCanvasOverrides(detached) ? detached : null
}

const overridesTooLarge = computed(() => serializableOverrides() === null)

// ── Preview: the export route, driven live ───────────────────────────────────

/**
 * Approved-snapshot mode: no `draft` flag, so the route resolves the tree from
 * the row's approval rather than the canvas page's live edits — a generation
 * must come from what was reviewed. The route and its query keys are imported,
 * not spelled out, so a rename cannot leave this iframe pointing at nothing.
 */
const previewUrl = computed(() => {
  const siteId = store.siteId
  if (!siteId) return ''
  const query = new URLSearchParams({
    [BRAND_CANVAS_QUERY_KEYS.siteId]: siteId,
    [BRAND_CANVAS_QUERY_KEYS.templateId]: props.template.id,
  })
  if (store.activePresetId) {
    query.set(BRAND_CANVAS_QUERY_KEYS.presetId, store.activePresetId)
  }
  return `${BRAND_CANVAS_ROUTE}?${query.toString()}`
})

const overrideRevision = ref(1)

function pushOverrides(): void {
  const win = previewFrame.value?.contentWindow
  if (!win) return
  const payload = serializableOverrides()
  if (payload === null) return
  const message: BrandCanvasOverridesMessage = {
    type: 'BRAND_CANVAS_OVERRIDES',
    source: 'splash',
    revision: overrideRevision.value,
    overrides: payload,
  }
  try {
    win.postMessage(message, window.location.origin)
  } catch (e: unknown) {
    // A failed push means the iframe is showing the previous state, not that
    // the edit was lost — say so rather than let the preview quietly lie.
    console.warn('[BrandTemplateAssetWorkspace] preview override push failed', e)
  }
}

// The scaled-iframe scaffolding, the `BRAND_CANVAS_READY` listener and the
// origin/source guard are shared with `BrandCanvasManagerPanel` — see
// `useBrandCanvasPreview`. `onReady` is this workspace's own addition: the
// route's settled signal is also the cue to re-push overrides, since a push
// made at the iframe's `load` event can land before anything is listening.
const {
  frameEl,
  previewFrame,
  previewScale: fitScale,
  previewError,
  previewWarnings,
  previewStatus,
  latestPaintedRevision,
  resetPreviewStatus,
} =
  useBrandCanvasPreview({
    width: () => props.template.width,
    height: () => props.template.height,
    onReady: pushOverrides,
  })

type PreviewZoom = 'fit' | '50' | '100'
const previewZoom = ref<PreviewZoom>('fit')
const displayScale = computed(() => {
  if (previewZoom.value === 'fit') return fitScale.value
  return Number(previewZoom.value) / 100
})
const scaledWidth = computed(() => Math.max(1, Math.round(props.template.width * displayScale.value)))
const scaledHeight = computed(() => Math.max(1, Math.round(props.template.height * displayScale.value)))

// Typing into a text field emits per keystroke; the route re-renders the whole
// canvas per message, so coalesce.
let pushTimer: ReturnType<typeof setTimeout> | null = null
watch(overrides, () => {
  overrideRevision.value += 1
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(pushOverrides, 150)
})

const previewCurrent = computed(() =>
  previewStatus.value === 'ready'
  && previewError.value === null
  && latestPaintedRevision.value === overrideRevision.value,
)

/** A reload is a new canvas; the previous verdict describes the old one. */
watch(previewUrl, resetPreviewStatus)

const scale = ref<BrandRenderScale>(1)

/**
 * Only scales whose multiplied output stays inside the render ceiling — a
 * 4096-wide canvas offers 1–2×, a web-sized one all four. Same rule the
 * server enforces, so what the select offers is exactly what save accepts.
 */
const scaleOptions = computed(() =>
  offerableRenderScales(props.template.width, props.template.height))
watch(scaleOptions, (options) => {
  if (!options.includes(scale.value)) scale.value = options[0] ?? 1
}, { immediate: true })

async function save(): Promise<void> {
  if (!formValid.value || !previewCurrent.value) return
  const payload = serializableOverrides()
  if (payload === null) return
  const saved = await store.saveTemplateToLibrary(props.template.id, payload, scale.value)
  // A successful save just wrote a new history row; force past the "already
  // loaded this template" guard so the strip on the Create-assets page shows
  // it immediately.
  if (saved) {
    savedBaseline.value = cloneJson(overrides.value)
    validationErrors.value = {}
    publishDraft()
    await templateStore.loadGenerations(props.template.id, true)
  }
}

onBeforeUnmount(() => {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
})
</script>

<style scoped>
.btw {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 380px);
  gap: var(--cms-sp-5, 24px);
  align-items: start;
  min-width: 0;
}

.btw__mobile-tabs {
  display: none;
}

.btw__stage-col {
  position: sticky;
  top: var(--cms-sp-4, 16px);
  min-width: 0;
}

.btw__stage-shell {
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
}

.btw__stage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-3, 12px);
  min-height: 58px;
  padding: var(--cms-sp-2, 8px) var(--cms-sp-4, 16px);
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface);
}

.btw__stage-identity {
  display: grid;
  grid-template-columns: auto minmax(0, auto);
  align-items: baseline;
  gap: 2px var(--cms-sp-2, 8px);
  min-width: 0;
}

.btw__stage-identity strong {
  overflow: hidden;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btw__stage-identity > span:last-child {
  grid-column: 1 / -1;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.btw__stage-eyebrow,
.btw__form-eyebrow,
.btw__block-overline {
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-overline, 11px);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;
}

.btw__zoom {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 11px;
  font-weight: 600;
}

.btw__zoom-select {
  appearance: none;
  height: 30px;
  padding: 0 27px 0 8px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background-color: var(--cms-surface);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%236e6659' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
  background-size: 14px;
  font: inherit;
  cursor: pointer;
}

.btw__frame {
  position: relative;
  max-height: min(72vh, 880px);
  min-height: 360px;
  padding: var(--cms-sp-5, 24px);
  overflow: auto;
  background-color: var(--cms-surface-sunken, var(--cms-surface-sunken));
  background-image:
    linear-gradient(rgba(110, 102, 89, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(110, 102, 89, 0.045) 1px, transparent 1px);
  background-size: 24px 24px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.btw__viewport {
  position: relative;
  flex: 0 0 auto;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 4px;
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-2, 0 1px 2px rgba(33, 30, 25, 0.05), 0 8px 24px rgba(33, 30, 25, 0.07));
}

.btw__canvas {
  position: absolute;
  top: 0;
  left: 0;
  border: 0;
  transform-origin: top left;
}

.btw__no-preview {
  margin: 0;
  padding: var(--cms-sp-5, 24px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-sm, 13px);
}

.btw__stage-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 38px;
  padding: 0 var(--cms-sp-4, 16px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.btw__stage-footer-dot {
  color: var(--cms-ink-subtle);
}

.btw__form {
  position: sticky;
  top: var(--cms-sp-4, 16px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: calc(100vh - 32px);
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-2, 0 1px 2px rgba(33, 30, 25, 0.05), 0 8px 24px rgba(33, 30, 25, 0.07));
}

.btw__form-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cms-sp-3, 12px);
  padding: var(--cms-sp-4, 16px);
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
}

.btw__form-header h3 {
  margin: 3px 0 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-lg, 16px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.btw__form-header p {
  margin: 4px 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}

.btw__draft-tools {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--cms-sp-2, 8px);
}

.btw__changed-badge {
  flex: 0 0 auto;
  padding: 4px 7px;
  border-radius: var(--cms-radius-pill, 999px);
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-soft, var(--cms-accent-soft));
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.btw__discard {
  white-space: nowrap;
}

.btw__form-body {
  min-height: 0;
  padding: var(--cms-sp-4, 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.btw__block-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 var(--cms-sp-4, 16px);
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
}

.btw__block {
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-4, 16px);
}

.btw__block-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-3, 12px);
  padding-bottom: var(--cms-sp-3, 12px);
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
}

.btw__block-label {
  margin: 3px 0 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 700;
  line-height: 1.35;
}

.btw__reset {
  flex: 0 0 auto;
}

.btw__reset .material-icons-outlined {
  font-size: 16px;
}

.btw__hint {
  margin: var(--cms-sp-4, 16px) 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.5;
}

.btw__hint--muted {
  padding-top: var(--cms-sp-3, 12px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  font-style: italic;
}

.btw__hint--empty {
  margin: 0;
  padding: var(--cms-sp-5, 24px) var(--cms-sp-4, 16px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  text-align: center;
}

.btw__actions {
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-3, 12px);
  padding: var(--cms-sp-4, 16px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.btw__export-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cms-sp-3, 12px);
}

.btw__export-scale {
  display: grid;
  grid-template-columns: auto 72px;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  margin: 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-sm, 13px);
  font-weight: 600;
}

.btw__scale {
  width: 72px;
}

.btw__output-size {
  padding-bottom: 10px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.btw__save {
  width: 100%;
}

.btw__save .material-icons-outlined {
  font-size: 17px;
}

.btw__error,
.btw__warning {
  margin: var(--cms-sp-2, 8px) 0 0;
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}

.btw__error { color: var(--cms-danger, var(--cms-danger)); }
.btw__warning { color: var(--cms-warn); }

.btw__validation-link {
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.btw__validation-link:focus-visible {
  outline: 2px solid var(--cms-accent);
  outline-offset: 3px;
  border-radius: 2px;
}

.btw__saved {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}

.btw__saved .material-icons-outlined {
  font-size: 16px;
}

.btw__saved a {
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}

@container (max-width: 860px) {
  .btw {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cms-sp-3, 12px);
  }

  .btw__mobile-tabs {
    position: sticky;
    z-index: 5;
    top: var(--cms-sp-2, 8px);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--cms-line, var(--cms-line));
    border-radius: 8px;
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }

  .btw__mobile-tabs button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    border: 0;
    border-radius: 6px;
    color: var(--cms-ink-muted, var(--cms-ink-muted));
    background: transparent;
    font: inherit;
    font-size: var(--cms-fs-sm, 13px);
    font-weight: 600;
    cursor: pointer;
  }

  .btw__mobile-tabs .material-icons-outlined {
    font-size: 17px;
  }

  .btw__mobile-tabs .btw__mobile-tab--active {
    color: var(--cms-accent-pressed, var(--cms-accent-pressed));
    background: var(--cms-surface);
    box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
  }

  .btw__pane--inactive {
    display: none;
  }

  .btw__stage-col {
    position: static;
    max-height: none;
  }

  .btw__form {
    position: sticky;
    top: 56px;
    max-height: calc(100dvh - 72px);
  }

  .btw__form-body {
    max-height: none;
    overflow-y: auto;
  }

  .btw__frame {
    max-height: 68vh;
  }
}

@container (max-width: 520px) {
  .btw__stage-toolbar,
  .btw__form-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .btw__zoom {
    width: 100%;
    justify-content: space-between;
  }

  .btw__frame {
    min-height: 300px;
    padding: var(--cms-sp-3, 12px);
  }

  .btw__export-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .btw__output-size {
    padding-bottom: 0;
  }
}
</style>
