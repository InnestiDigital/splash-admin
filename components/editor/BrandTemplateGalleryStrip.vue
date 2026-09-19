<template>
  <section v-if="store.selected" class="btg">
    <header class="btg__head">
      <div class="btg__heading-copy">
        <span class="btg__overline">{{ t('admin.brand.gallery.quickExport', 'Quick export') }}</span>
        <h3 class="btg__title">{{ t('admin.brand.gallery.title', 'Render history') }}</h3>
        <p>{{ t('admin.brand.gallery.description', 'Save the approved canvas now, or revisit assets pinned to earlier versions.') }}</p>
      </div>

      <div class="btg__save">
        <label class="btg__scale-label" :for="scaleId">{{ t('admin.brand.gallery.scale', 'Scale') }}</label>
        <select :id="scaleId" v-model.number="scale" class="cms-form-control cms-form-control--sm btg__scale" :disabled="store.savingRender">
          <option v-for="option in scaleOptions" :key="option" :value="option">
            {{ option }}×
          </option>
        </select>
        <span class="btg__output-size">{{ outputSize }}</span>
        <button
          type="button"
          class="btg__button cms-btn cms-btn--primary cms-btn--sm"
          :disabled="!store.canSaveRender || store.savingRender"
          @click="save"
        >
          <span v-if="store.savingRender" class="cms-btn-spinner" aria-hidden="true" />
          <span v-else class="material-icons-outlined" aria-hidden="true">save_alt</span>
          {{ store.savingRender
            ? t('admin.brand.gallery.rendering', 'Rendering…')
            : t('admin.brand.gallery.save', 'Save render to library') }}
        </button>
      </div>
    </header>

    <!--
      The gate is the server's, not this button's: `.../brand-formats/save`
      answers a draft with the same 404 as a missing row. Saying so up front
      keeps the message about the canvas's status.
    -->
    <p v-if="!store.canSaveRender" class="btg__note">
      {{ t('admin.brand.gallery.approveFirst', 'Only an approved canvas can be rendered. Approve this version to save a render.') }}
    </p>

    <p v-if="store.saveRenderError" class="btg__alert" role="alert">{{ store.saveRenderError }}</p>
    <p v-if="store.savedAsset" class="btg__receipt" role="status">
      {{ t('admin.brand.gallery.savedPrefix', 'Saved') }} <strong>{{ store.savedAsset.filename }}</strong> {{ t('admin.brand.gallery.savedSuffix', 'to the media library.') }}
    </p>

    <BrandGenerationStrip
      :rows="rows"
      :loading="store.generationsLoading"
      :error="store.generationsError"
      :empty-copy="t('admin.brand.gallery.empty', 'No renders saved yet. Approved versions you save appear here, each pinned to the version it came from.')"
    >
      <template #badge="{ row }">
        <span class="btg__version">v{{ row.templateVersion }}</span>
        <span :class="`btg__state btg__state--${row.__state}`">{{ stateLabel(row) }}</span>
      </template>
    </BrandGenerationStrip>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useBrandTemplateStore, type BrandTemplateGenerationCard } from '~/admin/stores/brandTemplateStore'
import BrandGenerationStrip from '~/admin/components/editor/BrandGenerationStrip.vue'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { offerableRenderScales, type BrandRenderScale } from '~/shared/types/brandRender'
import type { BrandTemplateGenerationRecord } from '~/shared/types/brandRender'

/**
 * The canvas gallery — every render this site has saved of the OPEN canvas,
 * newest first.
 *
 * The one thing it exists to say out loud is **which version each card came
 * from**. A saved PNG traces to one approved snapshot, so a card whose pin no
 * longer matches the row must read as stale rather than quietly imply that
 * re-rendering would give you the same picture. Nothing here re-renders an old
 * pin: the bytes are the record, and the recipe is deliberately not replayable
 * against a snapshot nobody approved.
 *
 * The thumbnail grid, the empty/loading/error states and the timestamp all
 * live in the shared `BrandGenerationStrip` — this panel owns only the save
 * controls and the version-pin badge, which is specific to a canvas gallery.
 */
const store = useBrandTemplateStore()
const { t } = useAdminI18n()

const scale = ref<BrandRenderScale>(1)

/** Same output-ceiling rule the server enforces — see the workspace's select. */
const scaleOptions = computed(() => {
  const selected = store.selected
  if (!selected) return offerableRenderScales(1, 1)
  return offerableRenderScales(selected.width, selected.height)
})
watch(scaleOptions, (options) => {
  if (!options.includes(scale.value)) scale.value = options[0] ?? 1
}, { immediate: true })
const scaleId = useId()
const outputSize = computed(() => {
  const selected = store.selected
  if (!selected) return ''
  return `${selected.width * scale.value}×${selected.height * scale.value}px`
})

/** A history row plus the pin state, flattened so the strip's `#badge` slot can read it directly. */
interface TemplateGenerationRow extends BrandTemplateGenerationRecord {
  __state: BrandTemplateGenerationCard['state']
  __currentVersion: number | null
}

const rows = computed<TemplateGenerationRow[]>(() =>
  store.generationCards.map(card => ({
    ...card.record,
    __state: card.state,
    __currentVersion: card.currentVersion,
  })),
)

function stateLabel(row: TemplateGenerationRow): string {
  if (row.__state === 'orphaned') return t('admin.brand.gallery.deleted', 'canvas deleted')
  if (row.__state === 'stale') return t('admin.brand.gallery.stale', `stale — now v${row.__currentVersion}`, { version: row.__currentVersion })
  return t('admin.brand.gallery.current', 'current')
}

async function save(): Promise<void> {
  await store.saveRender(scale.value)
}

/**
 * The gallery follows the selection. `loadGenerations` owns the supersede
 * token, so a fast switch settles on the newest template regardless of the
 * order the replies come back in.
 */
watch(
  () => store.selectedId,
  (templateId) => {
    if (templateId) void store.loadGenerations(templateId)
  },
  { immediate: true },
)
</script>

<style scoped>
.btg { overflow: hidden; border: 1px solid var(--cms-line, var(--cms-line)); border-radius: var(--cms-radius-card, 10px); background: var(--cms-surface); box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05)); }
.btg__head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--cms-sp-4, 16px); padding: var(--cms-sp-4, 16px); border-bottom: 1px solid var(--cms-line, var(--cms-line)); }
.btg__overline { display: block; color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: var(--cms-fs-overline, 11px); font-weight: 700; letter-spacing: 0.08em; line-height: 1.2; text-transform: uppercase; }
.btg__title { margin: 3px 0 0; color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-lg, 16px); font-weight: 700; line-height: 1.3; letter-spacing: -0.01em; }
.btg__heading-copy p { margin: 4px 0 0; color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: var(--cms-fs-caption, 12px); line-height: 1.45; }
.btg__save { display: grid; grid-template-columns: auto 70px auto auto; align-items: center; gap: var(--cms-sp-2, 8px); }
.btg__scale-label { color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-sm, 13px); font-weight: 600; }
.btg__scale { width: 70px; }
.btg__output-size { color: var(--cms-ink-muted, var(--cms-ink-muted)); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.btg__button .material-icons-outlined { font-size: 17px; }
.btg__note { margin: 0; padding: var(--cms-sp-2, 8px) var(--cms-sp-4, 16px); color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); font-size: var(--cms-fs-caption, 12px); line-height: 1.45; }
.btg__alert { margin: 0; padding: var(--cms-sp-2, 8px) var(--cms-sp-4, 16px); color: var(--cms-danger, var(--cms-danger)); background: var(--cms-danger-soft, var(--cms-danger-soft)); font-size: var(--cms-fs-caption, 12px); }
.btg__receipt { margin: 0; padding: var(--cms-sp-2, 8px) var(--cms-sp-4, 16px); color: var(--cms-accent-pressed, var(--cms-accent-pressed)); background: var(--cms-accent-softest, var(--cms-accent-softest)); font-size: var(--cms-fs-caption, 12px); }
.btg :deep(.bgs) { padding: var(--cms-sp-4, 16px); }
.btg__version { color: var(--cms-ink, var(--cms-ink)); font-size: 11px; font-weight: 700; }
.btg__state { padding: 3px 6px; border-radius: var(--cms-radius-pill, 999px); font-size: 10px; font-weight: 700; }
.btg__state--current { color: var(--cms-accent-pressed, var(--cms-accent-pressed)); background: var(--cms-accent-soft, var(--cms-accent-soft)); }
.btg__state--stale { color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); }
.btg__state--orphaned { color: var(--cms-danger, var(--cms-danger)); background: var(--cms-danger-soft, var(--cms-danger-soft)); }

@container (max-width: 680px) {
  .btg__save { width: 100%; grid-template-columns: auto 70px 1fr; }
  .btg__output-size { text-align: right; }
  .btg__button { grid-column: 1 / -1; }
}
</style>
