<template>
  <section class="bcm">
    <p v-if="store.error" class="bcm-alert bcm-alert--error" role="alert">{{ store.error }}</p>
    <ul v-if="store.warnings.length" class="bcm-alert bcm-alert--warn" aria-live="polite">
      <li v-for="warning in store.warnings" :key="warning">{{ warning }}</li>
    </ul>

    <ol class="bcm-flow" :aria-label="t('admin.brand.workflow', 'Brand canvas workflow')">
      <li class="bcm-flow__step" :class="{ 'bcm-flow__step--active': store.templates.length > 0 }">
        <span class="bcm-flow__index">01</span>
        <span><strong>{{ t('admin.brand.compose', 'Compose') }}</strong><small>{{ t('admin.brand.composeDescription', 'Build with site blocks') }}</small></span>
      </li>
      <li class="bcm-flow__step" :class="{ 'bcm-flow__step--active': Boolean(store.selected) }">
        <span class="bcm-flow__index">02</span>
        <span><strong>{{ t('admin.brand.approve', 'Approve') }}</strong><small>{{ t('admin.brand.approveDescription', 'Freeze a trusted version') }}</small></span>
      </li>
      <li class="bcm-flow__step" :class="{ 'bcm-flow__step--active': isApproved }">
        <span class="bcm-flow__index">03</span>
        <span><strong>{{ t('admin.brand.generate', 'Generate') }}</strong><small>{{ t('admin.brand.generateDescription', 'Create ready-to-use assets') }}</small></span>
      </li>
    </ol>

    <div class="bcm-layout">
      <!-- ── The canvases this site owns ──────────────────────────────────── -->
      <aside class="bcm-list">
        <header class="bcm-list__head">
          <div>
            <span class="bcm-overline">{{ t('admin.brand.library', 'Library') }}</span>
            <h2 class="bcm-list__title">{{ t('admin.brand.canvases', 'Canvases') }}</h2>
          </div>
          <span v-if="store.templates.length" class="cms-badge cms-badge--neutral">{{ store.templates.length }}</span>
        </header>
        <label v-if="store.templates.length > 4" class="bcm-search">
          <span class="material-icons-outlined" aria-hidden="true">search</span>
          <span class="bcm-sr-only">{{ t('admin.brand.filter', 'Filter canvases') }}</span>
          <input v-model="canvasQuery" type="search" :placeholder="t('admin.brand.filter', 'Filter canvases')">
        </label>
        <p v-if="store.loading" class="bcm-muted bcm-list__state">{{ t('admin.brand.canvas.loading', 'Loading canvases…') }}</p>
        <p v-else-if="!store.templates.length" class="bcm-muted">
          {{ t('admin.brand.createFirstCanvas', 'Create a canvas to begin.') }}
        </p>
        <p v-else-if="canvasQuery && !filteredTemplates.length" class="bcm-muted bcm-list__state">
          {{ t('admin.brand.canvas.noMatches', `No canvases match “${canvasQuery}”.`, { query: canvasQuery }) }}
        </p>
        <ul v-else class="bcm-list__rows">
          <li v-for="template in filteredTemplates" :key="template.id">
            <button
              type="button"
              class="bcm-row"
              :class="{ 'bcm-row--active': template.id === store.selectedId }"
              :aria-current="template.id === store.selectedId ? 'true' : undefined"
              @click="selectCanvas(template.id)"
            >
              <span class="bcm-row__visual" aria-hidden="true">
                <span :style="canvasThumbnailStyle(template.width, template.height)" />
              </span>
              <span class="bcm-row__copy">
                <span class="bcm-row__name">{{ template.name }}</span>
                <span class="bcm-row__meta">v{{ template.version }} · {{ template.width }}×{{ template.height }}</span>
              </span>
              <span class="bcm-badge" :class="`bcm-badge--${template.status}`">{{ canvasStatusLabel(template.status) }}</span>
            </button>
          </li>
        </ul>

        <button
          v-if="!showCreateForm"
          ref="newCanvasTrigger"
          type="button"
          class="cms-btn cms-btn--secondary cms-btn--block bcm-new"
          @click="openCreateForm"
        >
          <span class="material-icons-outlined" aria-hidden="true">add</span>
          {{ t('admin.brand.newCanvas', 'New canvas') }}
        </button>

        <form
          v-else
          class="bcm-create"
          @focusin="markCreateFormEngaged"
          @submit.prevent="createCanvas"
        >
          <header class="bcm-create__head">
            <div>
              <span class="bcm-overline">{{ t('admin.brand.newCanvas', 'New canvas') }}</span>
              <h3 class="bcm-create__title">{{ t('admin.brand.chooseFrame', 'Choose the frame') }}</h3>
            </div>
            <button
              v-if="store.templates.length"
              type="button"
              class="cms-btn cms-btn--ghost cms-btn--xs bcm-create__close"
              :aria-label="t('admin.brand.canvas.closeCreate', 'Close new canvas form')"
              @click="closeCreateForm"
            >
              <span class="material-icons-outlined" aria-hidden="true">close</span>
            </button>
          </header>

          <label class="bcm-label" for="bcm-create-name">{{ t('admin.brand.name', 'Name') }}</label>
          <input
            id="bcm-create-name"
            ref="createNameInput"
            v-model="createName"
            class="cms-form-control bcm-input"
            type="text"
            :maxlength="BRAND_TEMPLATE_NAME_MAX_LENGTH"
            :placeholder="t('admin.brand.canvas.namePlaceholder', 'Launch announcement')"
            required
          >

          <!--
            Art direction: absent entirely when the theme declares no
            `canvasPreset` layouts, so an unmarked theme creates exactly as it
            did before presets existed — no separate "unsupported" branch.
          -->
          <div v-if="store.presets.length" class="bcm-art-direction">
            <span class="bcm-label">{{ t('admin.brand.artDirection', 'Art direction') }}</span>
            <p class="bcm-muted bcm-hint">
              {{ t('admin.brand.artDirectionHint', 'Choose how much brand framing the canvas should use.') }}
            </p>
            <VisualOptionGroup
              :options="artDirectionOptions"
              :model-value="selectedLayoutId"
              mode="card"
              :aria-label="t('admin.brand.artDirection', 'Art direction')"
              @update:model-value="selectedLayoutId = $event"
            />
            <p class="bcm-muted bcm-hint">
              {{ t('admin.brand.artDirectionLater', 'You can change this later without moving existing content.') }}
            </p>
          </div>

          <span class="bcm-label">{{ t('admin.brand.canvasSize', 'Canvas size') }}</span>
          <div class="bcm-size-presets" role="group" :aria-label="t('admin.brand.canvas.sizePreset', 'Canvas size preset')">
            <button
              v-for="preset in CANVAS_SIZE_PRESETS"
              :key="preset.id"
              type="button"
              class="bcm-size-preset"
              :class="{ 'bcm-size-preset--active': activeSizePreset === preset.id }"
              :aria-pressed="activeSizePreset === preset.id"
              @click="applySizePreset(preset)"
            >
              <span class="bcm-size-preset__shape" :style="{ aspectRatio: `${preset.width} / ${preset.height}` }" aria-hidden="true" />
              <span><strong>{{ sizePresetLabel(preset) }}</strong><small>{{ preset.width }}×{{ preset.height }}</small></span>
            </button>
          </div>

          <div class="bcm-size">
            <div class="bcm-size__field">
              <label class="bcm-label" for="bcm-create-width">{{ t('admin.brand.width', 'Width') }}</label>
              <input
                id="bcm-create-width"
                v-model.number="createWidth"
                class="cms-form-control bcm-input bcm-input--size"
                type="number"
                :min="BRAND_CANVAS_MIN_SIZE"
                :max="BRAND_CANVAS_MAX_SIZE"
                step="1"
                required
              >
            </div>
            <div class="bcm-size__field">
              <label class="bcm-label" for="bcm-create-height">{{ t('admin.brand.height', 'Height') }}</label>
              <input
                id="bcm-create-height"
                v-model.number="createHeight"
                class="cms-form-control bcm-input bcm-input--size"
                type="number"
                :min="BRAND_CANVAS_MIN_SIZE"
                :max="BRAND_CANVAS_MAX_SIZE"
                step="1"
                required
              >
            </div>
          </div>
          <p v-if="sizeError" class="bcm-error" role="alert">{{ sizeError }}</p>
          <p v-else class="bcm-muted bcm-hint">
            {{ t(
              'admin.brand.canvasSizeHint',
              `${BRAND_CANVAS_MIN_SIZE}–${BRAND_CANVAS_MAX_SIZE} px. Export at 2–4× when you need a larger image.`,
              { min: BRAND_CANVAS_MIN_SIZE, max: BRAND_CANVAS_MAX_SIZE },
            ) }}
          </p>

          <button type="submit" class="bcm-button cms-btn cms-btn--primary cms-btn--block" :disabled="!canCreate || store.creating">
            <span v-if="store.creating" class="cms-btn-spinner" aria-hidden="true" />
            <span v-else class="material-icons-outlined" aria-hidden="true">dashboard_customize</span>
            {{ store.creating
              ? t('admin.brand.canvas.creating', 'Creating…')
              : t('admin.brand.canvas.create', 'Create canvas') }}
          </button>
          <p v-if="store.createError" class="bcm-error" role="alert">{{ store.createError }}</p>
        </form>
      </aside>

      <!-- ── The selected canvas ──────────────────────────────────────────── -->
      <div v-if="!store.selected" class="bcm-empty">
        <span class="material-icons-outlined" aria-hidden="true">dashboard_customize</span>
        <h2>{{ t('admin.brand.selectCanvas', 'Select a canvas') }}</h2>
        <p>{{ t('admin.brand.selectCanvasDescription', 'Preview the composition, approve a version, or open it in the site editor.') }}</p>
      </div>

      <div v-else class="bcm-detail">
        <header class="bcm-detail__head">
          <div class="bcm-identity">
            <span class="bcm-overline">{{ t('admin.brand.selectedCanvas', 'Selected canvas') }}</span>
            <div class="bcm-identity__row">
              <label class="bcm-sr-only" for="bcm-rename">{{ t('admin.brand.canvas.canvasName', 'Canvas name') }}</label>
              <input
                id="bcm-rename"
                v-model="nameDraft"
                class="cms-form-control bcm-input bcm-identity__input"
                type="text"
                :maxlength="BRAND_TEMPLATE_NAME_MAX_LENGTH"
              >
              <button
                type="button"
                class="bcm-button bcm-button--ghost cms-btn cms-btn--secondary cms-btn--sm"
                :disabled="!nameChanged || store.renaming"
                @click="commitRename"
              >
                {{ store.renaming ? t('admin.brand.canvas.saving', 'Saving…') : t('admin.brand.rename', 'Rename') }}
              </button>
            </div>
            <p class="bcm-detail__meta">
              <span class="bcm-badge" :class="`bcm-badge--${store.selected.status}`">{{ canvasStatusLabel(store.selected.status) }}</span>
              {{ t('admin.brand.canvas.version', `version ${store.selected.version}`, { version: store.selected.version }) }} · {{ store.selected.width }}×{{ store.selected.height }}px
            </p>
            <p v-if="store.renameError" class="bcm-error" role="alert">{{ store.renameError }}</p>
          </div>

          <div class="bcm-actions">
            <!--
              The canvas page is an ORDINARY page — deletable through the
              ordinary page endpoints, which know nothing about this row. When
              that has happened, `editorLink` opens a page that is not there;
              offering the rebuild instead is what turns that into a recoverable
              state rather than a dead link the author cannot explain.
            -->
            <template v-if="pageMissing">
              <span class="bcm-orphan" role="status">{{ t('admin.brand.canvas.pageMissing', 'Canvas page missing — rebuild from approved snapshot') }}</span>
              <button
                type="button"
                class="bcm-button cms-btn cms-btn--primary"
                :disabled="!isApproved || rebuilding"
                :title="isApproved ? undefined : t('admin.brand.canvas.rebuildApprovedOnly', 'Only an approved canvas has a snapshot to rebuild from.')"
                @click="rebuildCanvas"
              >
                {{ rebuilding ? t('admin.brand.canvas.rebuilding', 'Rebuilding…') : t('admin.brand.canvas.rebuild', 'Rebuild canvas') }}
              </button>
            </template>
            <NuxtLink v-else class="bcm-button cms-btn cms-btn--secondary" :to="editorLink">
              <span class="material-icons-outlined" aria-hidden="true">edit</span>
              {{ t('admin.brand.canvas.edit', 'Edit canvas') }}
            </NuxtLink>

            <NuxtLink v-if="isApproved" class="cms-btn cms-btn--primary" :to="assetsLink">
              <span class="material-icons-outlined" aria-hidden="true">auto_awesome</span>
              {{ t('admin.brand.assetsTitle', 'Create brand assets') }}
            </NuxtLink>

            <button
              type="button"
              class="bcm-button bcm-button--danger cms-btn cms-btn--danger-quiet"
              :disabled="store.deleting"
              @click="removeCanvas"
            >
              {{ store.deleting ? t('admin.brand.canvas.deleting', 'Deleting…') : t('admin.brand.canvas.delete', 'Delete') }}
            </button>
          </div>
        </header>

        <p v-if="store.deleteError" class="bcm-error" role="alert">{{ store.deleteError }}</p>
        <p v-if="rebuildError" class="bcm-error" role="alert">{{ rebuildError }}</p>
        <p v-if="pageCheckError" class="bcm-muted">{{ pageCheckError }}</p>

        <!-- ── Live preview ───────────────────────────────────────────────── -->
        <section class="bcm-preview">
          <header class="bcm-preview__head">
            <div>
              <span class="bcm-overline">{{ t('admin.brand.liveDraft', 'Live draft') }}</span>
              <div class="bcm-preview__identity">
                <h3 class="bcm-preview__title">{{ t('admin.brand.preview', 'Canvas preview') }}</h3>
                <span class="bcm-preview__status" :class="`bcm-preview__status--${previewIndicatorState}`" role="status">
                  <span class="material-icons-outlined" aria-hidden="true">{{ previewStatusIcon }}</span>
                  {{ previewStatusLabel }}
                </span>
              </div>
            </div>
            <div class="bcm-preview__tools">
              <label class="bcm-zoom">
                <span>{{ t('admin.brand.zoom', 'Zoom') }}</span>
                <select v-model="previewZoom" class="bcm-zoom__select" :aria-label="t('admin.brand.canvas.previewZoom', 'Preview zoom')">
                  <option value="fit">{{ t('admin.brand.fitCanvas', 'Fit canvas') }}</option>
                  <option value="50">50%</option>
                  <option value="100">100%</option>
                </select>
              </label>
              <button type="button" class="bcm-button bcm-button--ghost cms-btn cms-btn--secondary cms-btn--sm" @click="refreshPreview">
                <span class="material-icons-outlined" aria-hidden="true">refresh</span>
                {{ t('admin.brand.canvas.refresh', 'Refresh') }}
              </button>
            </div>
          </header>

          <!--
            The SAME SPA route headless Chromium screenshots, at the same canvas
            size, scaled down with a transform. One route means this picture
            cannot drift from the exported one; a second, admin-only renderer is
            exactly how a preview starts lying.
          -->
          <div class="bcm-stage">
            <div ref="frameEl" class="bcm-frame">
              <div
                class="bcm-frame__viewport"
                :style="{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }"
              >
                <iframe
                  v-if="previewSrc"
                  :key="previewSrc"
                  ref="previewFrame"
                  class="bcm-frame__canvas"
                  :src="previewSrc"
                  :title="t('admin.brand.canvas.previewOf', `Preview of ${store.selected.name}`, { name: store.selected.name })"
                  :style="{
                    width: `${store.selected.width}px`,
                    height: `${store.selected.height}px`,
                    transform: `scale(${displayScale})`,
                  }"
                />
              </div>
            </div>
          </div>
          <div class="bcm-preview__footer">
            <div class="bcm-preview__caption">
              <span>{{ store.selected.width }}×{{ store.selected.height }}px · shown at {{ Math.round(displayScale * 100) }}%</span>
              <span v-if="isApproved">{{ t('admin.brand.canvas.approvedAssets', `Assets use approved v${store.selected.version}. Re-approve after composition changes.`, { version: store.selected.version }) }}</span>
              <span v-else>{{ t('admin.brand.approveFirst', 'Approve this draft before generating assets.') }}</span>
            </div>
            <div class="bcm-actions">
              <button
                v-if="!confirming"
                ref="statusTrigger"
                type="button"
                class="bcm-button bcm-button--ghost cms-btn"
                :class="isApproved ? 'cms-btn--ghost' : 'cms-btn--primary'"
                :disabled="!isApproved && !draftApprovalReady"
                :title="!isApproved && !draftApprovalReady ? approvalDisabledTitle : undefined"
                @click="openConfirm"
              >
                <span class="material-icons-outlined" aria-hidden="true">{{ isApproved ? 'undo' : 'verified' }}</span>
                {{ isApproved
                  ? t('admin.brand.canvas.sendToDraft', 'Send back to draft')
                  : t('admin.brand.canvas.approveVersion', 'Approve this version') }}
              </button>
            </div>
          </div>
          <div v-if="confirming" class="bcm-confirm bcm-confirm--preview" role="group" :aria-label="confirmTitle">
            <p class="bcm-confirm__copy">{{ confirmCopy }}</p>
            <div class="bcm-actions">
              <button
                ref="confirmButton"
                type="button"
                class="bcm-button cms-btn cms-btn--primary cms-btn--sm"
                :disabled="store.statusSaving || (!isApproved && !draftApprovalReady)"
                @click="commitStatus"
              >
                {{ store.statusSaving ? t('admin.brand.canvas.saving', 'Saving…') : confirmTitle }}
              </button>
              <button
                type="button"
                class="bcm-button bcm-button--ghost cms-btn cms-btn--secondary cms-btn--sm"
                :disabled="store.statusSaving"
                @click="closeConfirm"
              >
                {{ t('admin.shell.cancel', 'Cancel') }}
              </button>
            </div>
          </div>
          <p v-if="store.statusError" class="bcm-preview__error" role="alert">{{ store.statusError }}</p>
          <!--
            The route's own verdict on the tree it painted. This preview is the
            one screen the manager approves from — a canvas that fails to render
            must not show a silent blank iframe here.
          -->
          <p v-if="previewError" class="bcm-preview__error" role="alert">
            {{ t('admin.brand.canvas.renderFailed', 'This canvas could not be rendered:') }} {{ previewError }}
          </p>
          <p v-if="previewUsesApprovedFallback" class="bcm-preview__fallback" role="alert">
            <strong>{{ t('admin.brand.canvas.fallbackTitle', 'Approved fallback shown.') }}</strong>
            {{ t('admin.brand.canvas.fallbackDescription', `The live draft could not be rendered, so this is approved version ${store.selected.version} — not the version awaiting approval. Repair or refresh the draft before approving.`, { version: store.selected.version }) }}
          </p>
          <p v-for="warning in previewWarnings" :key="warning" class="bcm-preview__warning" role="status">
            {{ warning }}
          </p>
        </section>

        <!-- Curation belongs beside approval, but after the visual verdict: an
             author decides what clients may edit only once the canvas is real. -->
        <BrandTemplateCurationEditor :template="store.selected" @dirty-change="curationDirty = $event" />

        <BrandTemplateGalleryStrip />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useBrandTemplateStore } from '~/admin/stores/brandTemplateStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useBrandCanvasPreview } from '~/admin/composables/useBrandCanvasPreview'
import { adminFetch } from '~/admin/utils/adminFetch'
import { extractFetchMessage } from '~/admin/utils/fetchError'
import BrandTemplateGalleryStrip from '~/admin/components/editor/BrandTemplateGalleryStrip.vue'
import BrandTemplateCurationEditor from '~/admin/components/editor/BrandTemplateCurationEditor.vue'
import VisualOptionGroup from '~/admin/components/sections/VisualOptionGroup.vue'
import { BRAND_CANVAS_QUERY_KEYS, BRAND_CANVAS_ROUTE } from '~/shared/features/brand-studio/canvasRenderMode'
import { BRAND_TEMPLATE_NAME_MAX_LENGTH } from '~/shared/types/brandTemplate'
import { BRAND_CANVAS_MIN_SIZE, BRAND_CANVAS_MAX_SIZE } from '~/shared/types/brandCanvas'
import { isRecord } from '~/shared/types/guards'
import type { LocalizedString } from '~/shared/types/layout'

/**
 * The brand canvas manager.
 *
 * A canvas is an ordinary `brand-canvas` PAGE plus a registry row, so this
 * panel is deliberately not an editor: it creates canvases, previews them,
 * approves a version, deletes them, and hands composition to the page editor
 * through a deep link. Everything that changes what renders happens there,
 * against the same blocks, sections and settings the public site uses.
 */
const store = useBrandTemplateStore()
const { t, locale } = useAdminI18n()
const { adminUrl } = useAdminUrl()
const route = useRoute()
const curationDirty = ref(false)
const canvasQuery = ref('')
const filteredTemplates = computed(() => {
  const query = canvasQuery.value.trim().toLocaleLowerCase()
  if (!query) return store.templates
  return store.templates.filter(template =>
    `${template.name} ${template.status} ${template.width}x${template.height}`.toLocaleLowerCase().includes(query),
  )
})

function confirmDiscardUnsaved(): boolean {
  if (!curationDirty.value && !nameChanged.value) return true
  const changed = [
    nameChanged.value ? t('admin.brand.canvas.canvasName', 'canvas name') : '',
    curationDirty.value ? t('admin.brand.canvas.permissions', 'customer-field permissions') : '',
  ].filter(Boolean).join(t('admin.brand.canvas.and', ' and '))
  return window.confirm(t('admin.brand.canvas.discardChanges', `Discard the unsaved ${changed} changes?`, { changes: changed }))
}

/**
 * Clear drafts only for an in-place action that is definitely continuing.
 * Route guards deliberately do not call this: a later guard can still cancel
 * the navigation, in which case this mounted component must retain its edits.
 */
function discardUnsaved(): void {
  curationDirty.value = false
  nameDraft.value = store.selected?.name ?? ''
}

function selectCanvas(templateId: string): void {
  if (templateId === store.selectedId) return
  if (!confirmDiscardUnsaved()) return
  discardUnsaved()
  store.select(templateId)
}

// ── Create ───────────────────────────────────────────────────────────────────

const createName = ref('')
const createWidth = ref(1200)
const createHeight = ref(630)
const showCreateForm = ref(false)
const createFormManuallyOpened = ref(false)
const newCanvasTrigger = ref<HTMLButtonElement | null>(null)
const createNameInput = ref<HTMLInputElement | null>(null)

async function openCreateForm(): Promise<void> {
  createFormManuallyOpened.value = true
  showCreateForm.value = true
  await nextTick()
  createNameInput.value?.focus()
}

async function closeCreateForm(): Promise<void> {
  createFormManuallyOpened.value = false
  showCreateForm.value = false
  await nextTick()
  newCanvasTrigger.value?.focus()
}

function markCreateFormEngaged(): void {
  createFormManuallyOpened.value = true
}

watch(
  () => [store.loading, store.templates.length, store.error] as const,
  ([loading, count, error]) => {
    if (loading || createFormManuallyOpened.value) return
    if (count > 0 || error) showCreateForm.value = false
    else showCreateForm.value = true
  },
)

// Child mounted hooks run before the page's mounted hook starts `store.load()`.
// Waiting one render turn lets loading begin first, avoiding a full creation
// form flash on sites whose list simply has not arrived yet.
onMounted(async () => {
  await nextTick()
  if (!store.loading && store.templates.length === 0 && !store.error) {
    showCreateForm.value = true
  }
})

const CANVAS_SIZE_PRESETS = [
  { id: 'landscape', labelKey: 'landscape', label: 'Landscape', width: 1200, height: 630 },
  { id: 'square', labelKey: 'square', label: 'Square', width: 1080, height: 1080 },
  { id: 'story', labelKey: 'story', label: 'Story', width: 1080, height: 1920 },
  { id: 'poster', labelKey: 'poster', label: 'Poster', width: 1240, height: 1754 },
] as const

function sizePresetLabel(preset: (typeof CANVAS_SIZE_PRESETS)[number]): string {
  return t(`admin.brand.canvas.${preset.labelKey}`, preset.label)
}

function canvasStatusLabel(status: string): string {
  if (status === 'approved') return t('admin.brand.canvas.approved', 'Approved')
  if (status === 'draft') return t('admin.brand.canvas.draft', 'Draft')
  return status
}

const activeSizePreset = computed(() =>
  CANVAS_SIZE_PRESETS.find(preset => preset.width === createWidth.value && preset.height === createHeight.value)?.id ?? '',
)

function applySizePreset(preset: (typeof CANVAS_SIZE_PRESETS)[number]): void {
  createWidth.value = preset.width
  createHeight.value = preset.height
}

function canvasThumbnailStyle(width: number, height: number): Record<string, string> {
  const ratio = Math.max(1, width) / Math.max(1, height)
  const maxWidth = 34
  const maxHeight = 32
  const frameWidth = ratio >= maxWidth / maxHeight ? maxWidth : maxHeight * ratio
  const frameHeight = ratio >= maxWidth / maxHeight ? maxWidth / ratio : maxHeight
  return {
    width: `${Math.max(1, Math.round(frameWidth))}px`,
    height: `${Math.max(1, Math.round(frameHeight))}px`,
    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
  }
}

const sizeInBounds = (value: number): boolean =>
  Number.isFinite(value) && value >= BRAND_CANVAS_MIN_SIZE && value <= BRAND_CANVAS_MAX_SIZE

const sizeError = computed(() => {
  if (!sizeInBounds(createWidth.value) || !sizeInBounds(createHeight.value)) {
    return t(
      'admin.brand.canvas.sizeError',
      `Width and height must be between ${BRAND_CANVAS_MIN_SIZE} and ${BRAND_CANVAS_MAX_SIZE} pixels.`,
      { min: BRAND_CANVAS_MIN_SIZE, max: BRAND_CANVAS_MAX_SIZE },
    )
  }
  return ''
})

const canCreate = computed(() => createName.value.trim().length > 0 && !sizeError.value)

// ── Art direction ────────────────────────────────────────────────────────────
//
// `store.presets` is the theme's ordered `canvasPreset` list — see
// `canvasPresetOptions()`. Empty means the theme declares none, which is what
// hides the whole field: creation then behaves exactly as it did before
// presets existed, with no `layoutId` sent and the server resolving its own
// default.

function localize(text: LocalizedString): string {
  return text[locale.value] ?? text['en-US'] ?? Object.values(text)[0] ?? ''
}

const selectedLayoutId = ref('')

/**
 * Re-seeded to the theme's declared default whenever the preset list changes
 * (first load, or a site switch that swaps the whole list) — never once the
 * author has picked something, so opening the form does not silently move
 * their selection out from under them.
 */
watch(
  () => store.presets,
  (presets) => {
    if (presets.some(preset => preset.layoutId === selectedLayoutId.value)) return
    selectedLayoutId.value = presets.find(preset => preset.isDefault)?.layoutId ?? presets[0]?.layoutId ?? ''
  },
  { immediate: true },
)

const artDirectionOptions = computed(() =>
  store.presets.map(preset => ({
    value: preset.layoutId,
    label: localize(preset.label),
    description: localize(preset.hint),
  })))

async function createCanvas(): Promise<void> {
  if (!canCreate.value || store.creating) return
  // `store.create()` selects the newly-created row. Treat that as the same
  // in-place replacement as choosing another canvas: the current rename and
  // curation drafts must never disappear without the author's permission.
  if (!confirmDiscardUnsaved()) return
  const layoutId = store.presets.length ? selectedLayoutId.value || undefined : undefined
  const created = await store.create(createName.value, createWidth.value, createHeight.value, layoutId)
  if (!created) return
  discardUnsaved()
  createName.value = ''
  await closeCreateForm()
}

// ── Rename ───────────────────────────────────────────────────────────────────

/** Seeded from the row, then owned here until the rename lands or the selection moves. */
const nameDraft = ref('')

watch(
  () => [store.selectedId, store.selected?.name] as const,
  ([, name]) => { nameDraft.value = name ?? '' },
  { immediate: true },
)

const nameChanged = computed(() => {
  const trimmed = nameDraft.value.trim()
  return trimmed.length > 0 && trimmed !== store.selected?.name
})

onBeforeRouteLeave(() => {
  if (!confirmDiscardUnsaved()) return false
})

// A program/site switch can reuse this page component. It needs the same
// protection as a full route leave, while preserving drafts if any later
// navigation guard cancels the update.
onBeforeRouteUpdate(() => {
  if (!confirmDiscardUnsaved()) return false
})

// `onBeforeRouteUpdate` runs before the router knows whether every other guard
// will allow the navigation. The reactive route changes only after a successful
// update, which is the safe point to retire this component's old-route drafts.
watch(
  () => route.fullPath,
  () => discardUnsaved(),
)

function beforeUnloadHandler(event: BeforeUnloadEvent): void {
  if (!curationDirty.value && !nameChanged.value) return
  event.preventDefault()
  event.returnValue = ''
}

const viewportHeight = ref(900)

function syncViewportHeight(): void {
  viewportHeight.value = window.innerHeight
}

onMounted(() => {
  syncViewportHeight()
  window.addEventListener('beforeunload', beforeUnloadHandler)
  window.addEventListener('resize', syncViewportHeight, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler)
  window.removeEventListener('resize', syncViewportHeight)
})

async function commitRename(): Promise<void> {
  await store.rename(nameDraft.value)
}

// ── The editor deep link ─────────────────────────────────────────────────────

/**
 * The canvas page is an ordinary page to the editor, so composing it needs no
 * second UI — only a link that opens the right page. `?pageId=` is honoured by
 * the editor's initialization (it otherwise opens the site's first page).
 */
const editorLink = computed(() => {
  const pageId = store.selected?.pageId ?? ''
  return adminUrl(`/editor?pageId=${encodeURIComponent(pageId)}`)
})

/** Approved canvases hand off directly to the consumption side of the studio. */
const assetsLink = computed(() => {
  const templateId = store.selected?.id
  return adminUrl(templateId ? `/brand/assets?templateId=${encodeURIComponent(templateId)}` : '/brand/assets')
})

// ── Orphan detection + rebuild ──────────────────────────────────────────────
//
// A canvas page is an ORDINARY page — deletable through the ordinary page
// endpoints, which know nothing about the registry row that depends on it —
// so `editorLink` can point at a page that is simply gone. There is no signal
// for that on the row itself (`pageId` is just a string), so this panel checks
// directly: the same single-page read the editor's own deep link would resolve.

/**
 * `false` until proven otherwise — a template just selected (or one whose
 * check has not resolved yet) shows the ordinary "Edit canvas" link rather
 * than assuming the worst.
 */
const pageMissing = ref(false)
const pageCheckError = ref<string | null>(null)
let pageCheckRequest = 0

/**
 * Reads as "the site has no such page" — the one 404 this check treats as
 * signal. Same shape `fontStore.ts` checks for its own feature-flag 404: an
 * ofetch error carries `statusCode` directly, or nests the real HTTP status
 * on `response.status`.
 */
function isPageNotFound(error: unknown): boolean {
  return isRecord(error)
    && (error.statusCode === 404 || (isRecord(error.response) && error.response.status === 404))
}

async function checkPageExists(): Promise<void> {
  const request = ++pageCheckRequest
  const template = store.selected
  const siteId = store.siteId
  pageCheckError.value = null
  if (!template || !siteId) {
    pageMissing.value = false
    return
  }

  const templateId = template.id
  const pageId = template.pageId
  const isCurrentCheck = (): boolean => request === pageCheckRequest
    && store.siteId === siteId
    && store.selected?.id === templateId
    && store.selected.pageId === pageId

  try {
    await adminFetch<unknown>(`/api/admin/s/${siteId}/pages/${pageId}`)
    if (!isCurrentCheck()) return
    pageMissing.value = false
  } catch (e: unknown) {
    if (!isCurrentCheck()) return
    if (isPageNotFound(e)) {
      pageMissing.value = true
      return
    }
    // Anything else (a network blip, a 500) is NOT proof the page is gone —
    // treating it as missing would offer a rebuild that only reproduces a page
    // that was there all along, over content this check could not read.
    pageMissing.value = false
    pageCheckError.value = extractFetchMessage(e, t('admin.brand.canvas.pageCheckFailed', 'Could not check whether this canvas page still exists'))
  }
}

watch(
  () => [store.siteId, store.selectedId, store.selected?.pageId] as const,
  () => { checkPageExists() },
  { immediate: true },
)

const rebuilding = ref(false)
const rebuildError = ref<string | null>(null)

/**
 * Mints a fresh canvas page from the approved snapshot and relinks this row
 * to it (`POST .../brand-templates/:id/rebuild`). `store.load()` afterwards
 * is what picks up the relinked `pageId` — this panel owns no template state
 * of its own to patch directly.
 */
async function rebuildCanvas(): Promise<void> {
  const template = store.selected
  const base = store.siteId ? `/api/admin/s/${store.siteId}` : null
  if (!template || !base || rebuilding.value) return

  rebuilding.value = true
  rebuildError.value = null
  try {
    await adminFetch<unknown>(`${base}/brand-templates/${template.id}/rebuild`, { method: 'POST' })
    await store.load()
    await checkPageExists()
  } catch (e: unknown) {
    rebuildError.value = extractFetchMessage(e, t('admin.brand.canvas.rebuildFailed', 'Failed to rebuild this canvas page'))
  } finally {
    rebuilding.value = false
  }
}

// ── Approval ─────────────────────────────────────────────────────────────────

const isApproved = computed(() => store.selected?.status === 'approved')

/**
 * Approving names the version it creates. Mirrors the server's own rule
 * (`resolveApprovalTransition` in brandTemplateService.ts): a row born
 * `draft` with no snapshot yet has its FIRST approval keep the version it's
 * already showing — bumping here would make "draft v1" become "approved v2"
 * with no v1 ever having existed. Only a re-approval (a snapshot already
 * exists to supersede) mints a new version.
 */
const nextVersion = computed(() => {
  const template = store.selected
  if (!template) return 1
  return template.snapshot === null ? template.version : template.version + 1
})

/** What the confirm button does — its label AND the group's accessible name. */
const confirmTitle = computed(() =>
  isApproved.value
    ? t('admin.brand.canvas.sendToDraft', 'Send back to draft')
    : t('admin.brand.canvas.approveNumberedVersion', `Approve version ${nextVersion.value}`, { version: nextVersion.value }),
)

const confirmCopy = computed(() => {
  const template = store.selected
  if (!template) return ''
  return isApproved.value
    ? t('admin.brand.canvas.sendToDraftConfirm', `Send "${template.name}" back to draft? It can't generate assets until it's approved again. The approved snapshot is kept until the next approval replaces it.`, { name: template.name })
    : t('admin.brand.canvas.approveConfirm', `Approve version ${nextVersion.value} of "${template.name}" — approval snapshots the canvas as it is now; later edits need re-approval.`, { name: template.name, version: nextVersion.value })
})

const confirming = ref(false)
const confirmButton = ref<HTMLButtonElement | null>(null)
const statusTrigger = ref<HTMLButtonElement | null>(null)

/** Moving focus onto the confirm keeps a keyboard user in the step they opened. */
async function openConfirm(): Promise<void> {
  if (curationDirty.value) {
    window.alert(t('admin.brand.canvas.resolvePermissionsFirst', 'Save or discard the customer-field permission changes before changing approval status.'))
    return
  }
  confirming.value = true
  await nextTick()
  confirmButton.value?.focus()
}

async function closeConfirm(): Promise<void> {
  confirming.value = false
  await nextTick()
  statusTrigger.value?.focus()
}

/** A confirm left open across a change to what it describes would name the wrong row. */
watch(
  () => [store.selectedId, store.selected?.version, store.selected?.status] as const,
  () => { confirming.value = false },
)

async function commitStatus(): Promise<void> {
  // Readiness is checked again at commit time: the confirmation may still be
  // open when a manual refresh replaces the iframe, or when its settled
  // verdict reveals that it painted the approved fallback instead of the
  // draft the author is about to snapshot.
  if (!isApproved.value && !draftApprovalReady.value) return
  const approving = !isApproved.value
  const ok = approving
    ? await store.setStatus('approved', previewDraftRevision.value ?? undefined)
    : await store.setStatus('draft')
  if (ok) {
    await closeConfirm()
  } else if (approving) {
    // A 409 means the page moved after this iframe settled. Other approval
    // failures also leave the evidence uncertain, so refresh before enabling
    // another attempt rather than letting a stale preview authorize it.
    refreshPreview()
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

async function removeCanvas(): Promise<void> {
  const template = store.selected
  if (!template || store.deleting) return
  const confirmed = window.confirm(
    t(
      'admin.brand.canvas.deleteConfirm',
      `Delete "${template.name}"? Its canvas page goes with it and this cannot be undone. Assets already generated from it stay in the media library.`,
      { name: template.name },
    ),
  )
  if (!confirmed) return
  await store.remove(template.id)
}

// ── Preview ──────────────────────────────────────────────────────────────────

/**
 * Bumped to re-fetch the same URL. The canvas is edited on another page, so
 * coming back with the iframe untouched would show the tree as it was before
 * the edit — a stale preview reads as a broken save.
 */
const previewNonce = ref(0)
const previewZoom = ref<'fit' | '50' | '100'>('fit')

function refreshPreview(): void {
  previewNonce.value += 1
}

/**
 * `draft=1` asks the route for the canvas page's LIVE tree rather than the
 * approved snapshot: this preview answers "what am I about to approve", which
 * is the question the manager exists for. The generate side previews the
 * snapshot instead.
 */
const previewSrc = computed(() => {
  const template = store.selected
  const siteId = store.siteId
  if (!template || !siteId) return ''
  // Route and keys imported, not spelled out — the same reason the generate
  // side imports them: a rename must not leave one of the two previews
  // pointing at a route that no longer exists.
  const query = new URLSearchParams({
    [BRAND_CANVAS_QUERY_KEYS.siteId]: siteId,
    [BRAND_CANVAS_QUERY_KEYS.templateId]: template.id,
    [BRAND_CANVAS_QUERY_KEYS.draft]: '1',
    r: String(previewNonce.value),
  })
  return `${BRAND_CANVAS_ROUTE}?${query.toString()}`
})

// ── Fit-to-column scaling, plus the route's own settled signal ─────────────
// The scaled-iframe scaffolding and the `BRAND_CANVAS_READY` listener are
// shared with `BrandTemplateAssetWorkspace` — see `useBrandCanvasPreview`.
// This panel has no overrides to re-push, so `onReady` is unused here.

const {
  frameEl,
  previewFrame,
  previewScale,
  previewError,
  previewWarnings,
  previewContentSource,
  previewFidelity,
  previewDraftRevision,
  previewStatus,
  resetPreviewStatus,
} =
  useBrandCanvasPreview({
    width: () => store.selected?.width ?? 0,
    height: () => store.selected?.height ?? 0,
  })

/**
 * Approval is stronger than "the iframe painted something": it must prove the
 * exact live draft was the tree that settled. An approved fallback remains
 * useful visual context, but can never authorize a draft snapshot.
 */
const draftApprovalReady = computed(() =>
  previewStatus.value === 'ready'
  && previewContentSource.value === 'draft'
  && previewFidelity.value === 'exact'
  && previewDraftRevision.value !== null,
)

const previewUsesApprovedFallback = computed(() =>
  previewStatus.value === 'ready'
  && previewContentSource.value === 'approved'
  && previewFidelity.value === 'fallback',
)

const previewIndicatorState = computed(() =>
  previewUsesApprovedFallback.value ? 'fallback' : previewStatus.value,
)

const previewStatusIcon = computed(() => {
  if (previewUsesApprovedFallback.value) return 'warning'
  if (previewStatus.value === 'ready') return 'check_circle'
  if (previewStatus.value === 'error') return 'error'
  return 'progress_activity'
})

const previewStatusLabel = computed(() => {
  if (previewStatus.value === 'error') return t('admin.brand.canvas.previewFailed', 'Preview failed')
  if (previewStatus.value === 'loading') return t('admin.brand.canvas.rendering', 'Rendering…')
  if (previewUsesApprovedFallback.value) return t('admin.brand.canvas.approvedFallback', 'Approved fallback')
  if (!draftApprovalReady.value && !isApproved.value) return t('admin.brand.canvas.draftNotVerified', 'Draft not verified')
  return isApproved.value
    ? t('admin.brand.canvas.previewReady', 'Preview ready')
    : t('admin.brand.canvas.readyToApprove', 'Ready to approve')
})

const approvalDisabledTitle = computed(() => {
  if (previewStatus.value === 'error') return t('admin.brand.canvas.resolvePreviewError', 'Resolve the preview error before approving this canvas.')
  if (previewStatus.value === 'loading') return t('admin.brand.canvas.waitForPreview', 'Wait for the current preview to finish rendering.')
  if (previewUsesApprovedFallback.value) {
    return t('admin.brand.canvas.repairDraft', 'The approved version is shown because the live draft could not be rendered. Repair or refresh the draft before approving.')
  }
  return t('admin.brand.canvas.refreshBeforeApproving', 'The preview has not verified the exact live draft. Refresh it before approving.')
})

const FIT_PREVIEW_MAX_HEIGHT = 620
const FIT_PREVIEW_MIN_HEIGHT = 220
const FIT_STAGE_VIEWPORT_RATIO = 0.72
const FIT_STAGE_VERTICAL_PADDING = 48
const fitPreviewHeight = computed(() => Math.min(
  FIT_PREVIEW_MAX_HEIGHT,
  Math.max(
    FIT_PREVIEW_MIN_HEIGHT,
    viewportHeight.value * FIT_STAGE_VIEWPORT_RATIO - FIT_STAGE_VERTICAL_PADDING,
  ),
))
const displayScale = computed(() => {
  const template = store.selected
  if (!template) return 1
  if (previewZoom.value === '100') return 1
  if (previewZoom.value === '50') return 0.5
  return Math.min(previewScale.value, fitPreviewHeight.value / template.height)
})
const scaledWidth = computed(() => Math.round((store.selected?.width ?? 0) * displayScale.value))
const scaledHeight = computed(() => Math.round((store.selected?.height ?? 0) * displayScale.value))

watch(() => store.selectedId, () => { previewZoom.value = 'fit' })

/** A new `src` is a new canvas; the previous verdict describes the old one. */
watch(previewSrc, resetPreviewStatus)
</script>

<style scoped>
.bcm {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-5, 24px);
  min-width: 0;
  color: var(--cms-ink-body, var(--cms-ink-body));
}

.bcm-overline {
  display: block;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-overline, 11px);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;
}

.bcm-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.bcm-flow {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
  list-style: none;
}

.bcm-flow__step {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--cms-sp-3, 12px);
  min-width: 0;
  padding: var(--cms-sp-3, 12px) var(--cms-sp-4, 16px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.bcm-flow__step + .bcm-flow__step {
  border-left: 1px solid var(--cms-line, var(--cms-line));
}

.bcm-flow__step--active {
  color: var(--cms-ink, var(--cms-ink));
  background: var(--cms-surface);
}

.bcm-flow__index {
  color: var(--cms-ink-subtle, var(--cms-ink-subtle));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.bcm-flow__step--active .bcm-flow__index { color: var(--cms-accent, var(--cms-accent)); }
.bcm-flow__step > span:last-child { display: flex; flex-direction: column; min-width: 0; }
.bcm-flow__step strong { font-size: var(--cms-fs-sm, 13px); line-height: 1.35; }
.bcm-flow__step small { overflow: hidden; font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }

.bcm-layout {
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  gap: var(--cms-sp-5, 24px);
  align-items: start;
  min-width: 0;
}

.bcm-list {
  position: sticky;
  top: var(--cms-sp-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-3, 12px);
  max-height: calc(100vh - 32px);
  padding: var(--cms-sp-4, 16px);
  overflow-y: auto;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
  scrollbar-gutter: stable;
}

.bcm-list__head,
.bcm-create__head,
.bcm-preview__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cms-sp-3, 12px);
}

.bcm-list__title,
.bcm-create__title,
.bcm-preview__title {
  margin: 3px 0 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-lg, 16px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.bcm-list__state { padding: var(--cms-sp-3, 12px) 0; }
.bcm-search { position: relative; display: flex; align-items: center; margin: 0; }
.bcm-search > .material-icons-outlined { position: absolute; left: 10px; z-index: 1; color: var(--cms-ink-subtle, var(--cms-ink-subtle)); font-size: 17px; pointer-events: none; }
.bcm-search input { width: 100%; height: 36px; padding: 0 30px 0 34px; border: 1px solid var(--cms-line-strong, var(--cms-line-strong)); border-radius: var(--cms-radius-control, 6px); color: var(--cms-ink-body, var(--cms-ink-body)); background: var(--cms-surface); font: inherit; font-size: var(--cms-fs-sm, 13px); }
.bcm-search input:focus { outline: none; border-color: var(--cms-accent, var(--cms-accent)); box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2)); }
.bcm-search input::placeholder { color: var(--cms-ink-subtle, var(--cms-ink-subtle)); }
.bcm-list__rows { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }

.bcm-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  width: 100%;
  min-height: 62px;
  padding: var(--cms-sp-2, 8px);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .bcm-row:not(.bcm-row--active):hover { background: var(--cms-surface-subtle, var(--cms-surface-subtle)); }
}

.bcm-row:active { transform: scale(0.99); }
.bcm-row--active { border-color: rgba(46, 125, 50, 0.28); background: var(--cms-accent-softest, var(--cms-accent-softest)); }

.bcm-row__visual {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 42px;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: 6px;
  background-color: var(--cms-surface-sunken, var(--cms-surface-sunken));
  background-image:
    linear-gradient(rgba(110, 102, 89, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(110, 102, 89, 0.06) 1px, transparent 1px);
  background-size: 8px 8px;
}

.bcm-row__visual > span {
  display: block;
  width: 34px;
  max-height: 32px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: 2px;
  background: var(--cms-surface);
  box-shadow: 0 1px 2px rgba(33, 30, 25, 0.1);
}

.bcm-row__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.bcm-row__name { overflow: hidden; color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-sm, 13px); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.bcm-row__meta { color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: 11px; font-variant-numeric: tabular-nums; }

.bcm-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  border-radius: var(--cms-radius-pill, 999px);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.045em;
  line-height: 1.4;
  text-transform: uppercase;
  white-space: nowrap;
}

.bcm-badge--draft { color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); }
.bcm-badge--approved { color: var(--cms-accent-pressed, var(--cms-accent-pressed)); background: var(--cms-accent-soft, var(--cms-accent-soft)); }

.bcm-new .material-icons-outlined,
.bcm-button .material-icons-outlined { font-size: 17px; }

.bcm-create {
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-3, 12px);
  margin-top: var(--cms-sp-1, 4px);
  padding-top: var(--cms-sp-4, 16px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
}

.bcm-create__close { width: 28px; padding: 0; }
.bcm-create__close .material-icons-outlined { font-size: 16px; }
.bcm-label { margin: 0; color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-sm, 13px); font-weight: 600; }
.bcm-hint { margin: -4px 0 0; color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: var(--cms-fs-caption, 12px); line-height: 1.5; }
.bcm-input { min-width: 0; }
.bcm-art-direction { display: flex; flex-direction: column; gap: var(--cms-sp-2, 8px); }
.bcm-art-direction :deep(.visual-option-group) { flex-direction: column; gap: 6px; }
.bcm-art-direction :deep(.visual-option-group__card) { align-items: center; flex: 0 0 auto; flex-direction: row; width: 100%; min-height: 58px; padding: 8px 10px; border-color: var(--cms-line, var(--cms-line)); text-align: left; }
.bcm-art-direction :deep(.visual-option-group__icon),
.bcm-art-direction :deep(.visual-option-group__placeholder) { flex: 0 0 auto; width: 30px; height: 30px; }
.bcm-art-direction :deep(.visual-option-group__copy) { align-items: flex-start; }
.bcm-art-direction :deep(.visual-option-group__label) { overflow: visible; font-size: var(--cms-fs-sm, 13px); font-weight: 700; line-height: 1.3; text-overflow: clip; white-space: normal; }
.bcm-art-direction :deep(.visual-option-group__description) { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.bcm-size-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.bcm-size-preset { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 7px; min-height: 46px; padding: 6px 7px; border: 1px solid var(--cms-line, var(--cms-line)); border-radius: 7px; color: var(--cms-ink-body, var(--cms-ink-body)); background: var(--cms-surface); font: inherit; text-align: left; cursor: pointer; transition: border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out), background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out), box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out); }
.bcm-size-preset--active { border-color: var(--cms-accent, var(--cms-accent)); color: var(--cms-accent-pressed, var(--cms-accent-pressed)); background: var(--cms-accent-softest, var(--cms-accent-softest)); box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2)); }
.bcm-size-preset__shape { display: block; max-width: 25px; max-height: 28px; border: 1px solid var(--cms-line-strong, var(--cms-line-strong)); border-radius: 2px; background: var(--cms-surface-subtle, var(--cms-surface-subtle)); }
.bcm-size-preset > span:last-child { display: flex; flex-direction: column; min-width: 0; }
.bcm-size-preset strong { overflow: hidden; font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.bcm-size-preset small { color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: 9px; font-variant-numeric: tabular-nums; }
.bcm-size { display: grid; grid-template-columns: 1fr 1fr; gap: var(--cms-sp-2, 8px); }
.bcm-size__field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.bcm-input--size { width: 100%; }

.bcm-detail { display: flex; flex-direction: column; gap: var(--cms-sp-4, 16px); min-width: 0; }

.bcm-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cms-sp-4, 16px);
  padding: var(--cms-sp-4, 16px);
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
}

.bcm-identity { display: flex; flex: 1 1 300px; flex-direction: column; gap: 6px; min-width: 240px; }
.bcm-identity__row { display: flex; align-items: center; gap: var(--cms-sp-2, 8px); max-width: 520px; }
.bcm-identity__input { height: 38px; color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-lg, 16px); font-weight: 700; }
.bcm-detail__meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--cms-sp-2, 8px); margin: 0; color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: var(--cms-fs-caption, 12px); font-variant-numeric: tabular-nums; }
.bcm-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: var(--cms-sp-2, 8px); }

.bcm-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-4, 16px);
  padding: var(--cms-sp-3, 12px) var(--cms-sp-4, 16px);
  border: 1px solid rgba(46, 125, 50, 0.28);
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-accent-softest, var(--cms-accent-softest));
}

.bcm-confirm__copy { margin: 0; color: var(--cms-ink-body, var(--cms-ink-body)); font-size: var(--cms-fs-sm, 13px); line-height: 1.5; }
.bcm-confirm .bcm-actions { flex: 0 0 auto; }

.bcm-preview {
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
}

.bcm-preview__head { min-height: 60px; padding: var(--cms-sp-3, 12px) var(--cms-sp-4, 16px); border-bottom: 1px solid var(--cms-line, var(--cms-line)); }
.bcm-preview__identity { display: flex; align-items: center; flex-wrap: wrap; gap: var(--cms-sp-2, 8px); margin-top: 3px; }
.bcm-preview__identity .bcm-preview__title { margin-top: 0; }
.bcm-preview__status { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border-radius: var(--cms-radius-pill, 999px); color: var(--cms-ink-muted, var(--cms-ink-muted)); background: var(--cms-surface-subtle, var(--cms-surface-subtle)); font-size: 10px; font-weight: 700; line-height: 1.4; }
.bcm-preview__status .material-icons-outlined { font-size: 14px; }
.bcm-preview__status--ready { color: var(--cms-accent-pressed, var(--cms-accent-pressed)); background: var(--cms-accent-soft, var(--cms-accent-soft)); }
.bcm-preview__status--fallback { color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); }
.bcm-preview__status--error { color: var(--cms-danger, var(--cms-danger)); background: var(--cms-danger-soft, var(--cms-danger-soft)); }
.bcm-preview__status--loading .material-icons-outlined { animation: bcm-preview-spin 1s linear infinite; }
.bcm-preview__tools { display: flex; align-items: center; gap: var(--cms-sp-2, 8px); }
.bcm-zoom { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: var(--cms-fs-caption, 12px); font-weight: 600; }
.bcm-zoom__select { appearance: none; height: 34px; padding: 0 30px 0 9px; border: 1px solid var(--cms-line-strong, var(--cms-line-strong)); border-radius: var(--cms-radius-control, 6px); color: var(--cms-ink-body, var(--cms-ink-body)); background-color: var(--cms-surface); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%236e6659' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; background-size: 14px; font: inherit; cursor: pointer; }

.bcm-stage {
  max-height: min(72vh, 760px);
  padding: var(--cms-sp-5, 24px);
  overflow: auto;
  background-color: var(--cms-surface-sunken, var(--cms-surface-sunken));
  background-image:
    linear-gradient(rgba(110, 102, 89, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(110, 102, 89, 0.045) 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Painted at native size, scaled as one object: the preview and renderer keep
   identical layout decisions rather than reflowing inside the admin column. */
.bcm-frame {
  position: relative;
  max-width: 100%;
  margin: 0 auto;
  overflow: visible;
}

.bcm-frame__viewport { position: relative; margin: 0 auto; overflow: hidden; border-radius: 4px; background: var(--cms-surface); box-shadow: var(--cms-elev-2, 0 1px 2px rgba(33, 30, 25, 0.05), 0 8px 24px rgba(33, 30, 25, 0.07)); }
.bcm-frame__canvas { position: absolute; top: 0; left: 0; border: 0; transform-origin: top left; }

.bcm-preview__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-3, 12px);
  min-height: 54px;
  padding: var(--cms-sp-2, 8px) var(--cms-sp-3, 12px) var(--cms-sp-2, 8px) var(--cms-sp-4, 16px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.bcm-preview__caption {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: var(--cms-sp-3, 12px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 11px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}

.bcm-preview__caption span:last-child { color: var(--cms-ink-body, var(--cms-ink-body)); }
.bcm-confirm--preview { border: 0; border-top: 1px solid rgba(46, 125, 50, 0.28); border-radius: 0; }
.bcm-preview__error,
.bcm-preview__fallback,
.bcm-preview__warning { margin: 0; padding: var(--cms-sp-2, 8px) var(--cms-sp-4, 16px); font-size: var(--cms-fs-caption, 12px); line-height: 1.45; }
.bcm-preview__error { color: var(--cms-danger, var(--cms-danger)); background: var(--cms-danger-soft, var(--cms-danger-soft)); }
.bcm-preview__fallback { color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); }
.bcm-preview__warning { color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); }

.bcm-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 360px;
  padding: var(--cms-sp-6, 32px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  text-align: center;
}

.bcm-empty > .material-icons-outlined { margin-bottom: var(--cms-sp-3, 12px); color: var(--cms-ink-subtle, var(--cms-ink-subtle)); font-size: 32px; }
.bcm-empty h2 { margin: 0; color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-lg, 16px); }
.bcm-empty p { max-width: 400px; margin: 6px 0 0; font-size: var(--cms-fs-sm, 13px); line-height: 1.5; }

.bcm-alert { margin: 0; padding: var(--cms-sp-3, 12px) var(--cms-sp-4, 16px); border: 1px solid transparent; border-radius: var(--cms-radius-control, 6px); font-size: var(--cms-fs-sm, 13px); line-height: 1.5; }
.bcm-alert--error { border-color: rgba(158, 43, 37, 0.24); color: var(--cms-danger, var(--cms-danger)); background: var(--cms-danger-soft, var(--cms-danger-soft)); }
.bcm-alert--warn { border-color: rgba(148, 87, 8, 0.25); color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); }
.bcm-alert li { margin: 0; }
.bcm-error { margin: 0; color: var(--cms-danger, var(--cms-danger)); font-size: var(--cms-fs-caption, 12px); line-height: 1.45; }
.bcm-orphan { max-width: 220px; color: var(--cms-danger, var(--cms-danger)); font-size: var(--cms-fs-caption, 12px); font-weight: 600; line-height: 1.4; }
.bcm-muted { margin: 0; color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: var(--cms-fs-sm, 13px); line-height: 1.5; }

@container (max-width: 960px) {
  .bcm-layout { grid-template-columns: minmax(0, 1fr); }
  .bcm-list { position: static; max-height: none; }
  .bcm-list__rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .bcm-create { max-width: 560px; }
}

@container (max-width: 680px) {
  .bcm-flow { grid-template-columns: minmax(0, 1fr); }
  .bcm-flow__step + .bcm-flow__step { border-top: 1px solid var(--cms-line, var(--cms-line)); border-left: 0; }
  .bcm-flow__step small { white-space: normal; }
  .bcm-detail__head,
  .bcm-confirm { align-items: stretch; flex-direction: column; }
  .bcm-actions { justify-content: flex-start; }
  .bcm-actions .cms-btn { flex: 1 1 auto; }
  .bcm-identity { min-width: 0; }
  .bcm-identity__row { align-items: stretch; flex-direction: column; }
  .bcm-preview__caption { align-items: flex-start; flex-direction: column; }
  .bcm-preview__caption span:last-child { text-align: left; }
  .bcm-preview__footer { align-items: stretch; flex-direction: column; }
  .bcm-preview__footer .bcm-actions { width: 100%; }
  .bcm-preview__footer .cms-btn { width: 100%; }
  .bcm-preview__tools { align-items: stretch; flex-direction: column; }
  .bcm-stage { padding: var(--cms-sp-3, 12px); }
}

@keyframes bcm-preview-spin { to { transform: rotate(360deg); } }
</style>
