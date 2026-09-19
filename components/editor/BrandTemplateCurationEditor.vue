<template>
  <section class="btc">
    <header class="btc__head">
      <div>
        <span class="btc__overline">{{ t('admin.brand.curation.permissions', 'Generation permissions') }}</span>
        <h3 class="btc__title">{{ t('admin.brand.curation.title', 'Customer-editable fields') }}</h3>
        <p class="btc__copy">
          {{ t('admin.brand.curation.description', 'Choose what client accounts may change when generating. Everything else stays exactly as approved.') }}
        </p>
      </div>
      <span v-if="template.snapshot" class="btc__summary">{{ t('admin.brand.curation.selected', `${checkedCount} selected`, { count: checkedCount }) }}</span>
    </header>

    <p v-if="!template.snapshot" class="btc__empty">
      <span class="material-icons-outlined" aria-hidden="true">lock_clock</span>
      {{ t('admin.brand.curation.approveFirst', 'Approve a version first. Customer fields are always chosen from a trusted snapshot.') }}
    </p>

    <template v-else>
      <p v-if="!blocks.length" class="btc__empty">
        {{ t('admin.brand.curation.noFields', 'The approved canvas has no blocks with editable settings in this theme, so there is nothing a client could change.') }}
      </p>

      <template v-else-if="activeEntry">
        <div class="btc__body">
          <label v-if="blocks.length > 1" class="btc__picker" for="btc-block">
            <span>{{ t('admin.brand.curation.contentBlock', 'Content block') }}</span>
            <select id="btc-block" v-model="activeBlockId" class="cms-form-control">
              <option v-for="entry in blocks" :key="entry.block.id" :value="entry.block.id">
                {{ entry.label }} · {{ t('admin.brand.curation.selected', `${selectedFor(entry.block.id)} selected`, { count: selectedFor(entry.block.id) }) }}
              </option>
            </select>
          </label>

          <fieldset class="btc__block">
            <legend class="btc__block-label">{{ activeEntry.label }}</legend>
            <div class="btc__block-actions">
              <button type="button" class="cms-btn cms-btn--ghost cms-btn--xs" @click="selectAll(activeEntry)">{{ t('admin.brand.curation.selectAll', 'Select all') }}</button>
              <button type="button" class="cms-btn cms-btn--ghost cms-btn--xs" @click="selectNone(activeEntry)">{{ t('admin.brand.curation.selectNone', 'Select none') }}</button>
            </div>
            <div class="btc__fields">
              <label
                v-for="field in curatableSettings(activeEntry.schema.settings)"
                :key="field.id"
                class="btc__field"
              >
                <input
                  type="checkbox"
                  :checked="isChecked(activeEntry.block.id, field.id)"
                  @change="toggle(activeEntry.block.id, field.id)"
                >
                <span>{{ fieldLabel(field) }}</span>
              </label>
            </div>
          </fieldset>

          <p v-if="droppedCount" class="btc__notice">
            <span class="material-icons-outlined" aria-hidden="true">info</span>
            {{ droppedCount === 1
              ? t('admin.brand.curation.droppedOne', '1 previously selected field is no longer in this approved canvas. Saving removes it.')
              : t('admin.brand.curation.droppedMany', `${droppedCount} previously selected fields are no longer in this approved canvas. Saving removes them.`, { count: droppedCount }) }}
          </p>
        </div>

        <footer class="btc__actions">
          <span class="btc__save-state" :class="{ 'btc__save-state--dirty': dirty }">
            <span class="material-icons-outlined" aria-hidden="true">{{ dirty ? 'edit' : 'check_circle' }}</span>
            {{ dirty
              ? t('admin.brand.curation.unsaved', 'Unsaved permission changes')
              : t('admin.brand.curation.upToDate', 'Permissions up to date') }}
          </span>
          <div class="btc__action-buttons">
            <button
              type="button"
              class="btc__button btc__button--ghost cms-btn cms-btn--secondary cms-btn--sm"
              :disabled="!dirty || store.curationSaving"
              @click="resetDraft"
            >
              {{ t('admin.brand.curation.discard', 'Discard') }}
            </button>
            <button
              type="button"
              class="btc__button cms-btn cms-btn--primary cms-btn--sm"
              :disabled="!dirty || store.curationSaving"
              @click="commit"
            >
              <span v-if="store.curationSaving" class="cms-btn-spinner" aria-hidden="true" />
              {{ store.curationSaving
                ? t('admin.brand.curation.saving', 'Saving…')
                : t('admin.brand.curation.save', 'Save customer fields') }}
            </button>
          </div>
        </footer>

        <p v-if="store.curationError" class="btc__error" role="alert">{{ store.curationError }}</p>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useBrandTemplateStore } from '~/admin/stores/brandTemplateStore'
import { useCanvasBlockForms } from '~/admin/composables/useCanvasBlockForms'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'
import { curatableSettings, effectiveCuration } from '~/shared/features/brand-studio/curation'
import type { CanvasBlockForm } from '~/admin/composables/useCanvasBlockForms'
import type { BrandTemplateCuration, BrandTemplateRecord } from '~/shared/types/brandTemplate'
import type { BlockSchemaField } from '~/shared/types/theme'

/**
 * Per-template CURATION, authored where the template already is.
 *
 * This lives in the manager panel's detail pane rather than in the Create-assets
 * workspace on purpose: curating is an authoring act on a template the admin has
 * already selected and approved, and the workspace is the CONSUMPTION surface —
 * the one a client opens. Putting the checkboxes there would put the permission
 * next to the thing it restricts, visible to the restricted party.
 *
 * The block/field list comes from `useCanvasBlockForms`, the SAME walk the
 * workspace renders its form from, so a ticked checkbox always corresponds to a
 * control the client actually gets. A second walk here could curate a field the
 * theme no longer renders.
 *
 * The draft is local until "Save customer fields": a checkbox that wrote through
 * on every click would fire a PUT per keystroke-equivalent and leave a
 * half-curated template if one failed.
 */
const props = defineProps<{ template: BrandTemplateRecord }>()
const emit = defineEmits<{ 'dirty-change': [dirty: boolean] }>()

const store = useBrandTemplateStore()
const { t } = useAdminI18n()
const { blocks } = useCanvasBlockForms(toRef(props, 'template'))

/**
 * The row's curation as it applies to the APPROVED canvas — intersected, so a
 * key naming a block a re-approval deleted never reaches a checkbox. It is also
 * what the client is served, so the editor and the consumer agree on what
 * "currently curated" means.
 */
const stored = computed<BrandTemplateCuration>(
  () => effectiveCuration(props.template.snapshot, props.template.customerSettings),
)

/** Local draft: block id → the ticked setting ids. */
const draft = ref<Map<string, Set<string>>>(new Map())
const activeBlockId = ref('')
const activeEntry = computed(() =>
  blocks.value.find(entry => entry.block.id === activeBlockId.value)
  ?? blocks.value[0]
  ?? null,
)

watch(blocks, (entries) => {
  if (entries.some(entry => entry.block.id === activeBlockId.value)) return
  activeBlockId.value = entries[0]?.block.id ?? ''
}, { immediate: true })

function resetDraft(): void {
  draft.value = new Map(
    Object.entries(stored.value).map(([blockId, settingIds]) => [blockId, new Set(settingIds)]),
  )
}

// Re-seeded whenever the row this component describes changes — a draft left
// over from another template (or from before an approval replaced the tree)
// would tick boxes against fields that are no longer there.
watch(
  () => [props.template.id, props.template.version, stored.value] as const,
  resetDraft,
  { immediate: true, deep: true },
)

function isChecked(blockId: string, settingId: string): boolean {
  return draft.value.get(blockId)?.has(settingId) ?? false
}

/**
 * Replaces the Map rather than mutating it in place: `draft` is a `ref` holding
 * a Map, and Vue does not track Set mutations inside one, so an in-place add
 * would tick a box the template never re-renders.
 */
function withDraft(mutate: (next: Map<string, Set<string>>) => void): void {
  const next = new Map<string, Set<string>>()
  for (const [blockId, settingIds] of draft.value) next.set(blockId, new Set(settingIds))
  mutate(next)
  draft.value = next
}

function toggle(blockId: string, settingId: string): void {
  withDraft((next) => {
    const settings = next.get(blockId) ?? new Set<string>()
    if (settings.has(settingId)) settings.delete(settingId)
    else settings.add(settingId)
    if (settings.size === 0) next.delete(blockId)
    else next.set(blockId, settings)
  })
}

function selectAll(entry: CanvasBlockForm): void {
  withDraft((next) => {
    next.set(entry.block.id, new Set(curatableSettings(entry.schema.settings).map(field => field.id)))
  })
}

function selectNone(entry: CanvasBlockForm): void {
  withDraft((next) => { next.delete(entry.block.id) })
}

/** Field ids the theme's schemas no longer declare — visible so a save is not a silent loss. */
const droppedCount = computed(() => {
  const declared = new Map(
    blocks.value.map(entry => [entry.block.id, new Set(curatableSettings(entry.schema.settings).map(field => field.id))]),
  )
  let dropped = 0
  for (const [blockId, settingIds] of Object.entries(stored.value)) {
    const known = declared.get(blockId)
    dropped += known ? settingIds.filter(id => !known.has(id)).length : settingIds.length
  }
  return dropped
})

const checkedCount = computed(() => {
  let total = 0
  for (const settings of draft.value.values()) total += settings.size
  return total
})

function selectedFor(blockId: string): number {
  return draft.value.get(blockId)?.size ?? 0
}

/** The draft as the wire shape, with ids sorted so two equal selections serialize alike. */
function draftRecord(): BrandTemplateCuration {
  const record: BrandTemplateCuration = {}
  for (const [blockId, settings] of draft.value) {
    if (settings.size > 0) record[blockId] = [...settings].sort()
  }
  return record
}

const dirty = computed(() => {
  const next = draftRecord()
  const current = stored.value
  const nextKeys = Object.keys(next).sort()
  const currentKeys = Object.keys(current).sort()
  if (nextKeys.length !== currentKeys.length) return true
  return nextKeys.some((blockId, index) => {
    if (currentKeys[index] !== blockId) return true
    const currentSettings = current[blockId]
    const nextIds = next[blockId]
    if (!currentSettings || !nextIds) return true
    const currentIds = [...currentSettings].sort()
    return currentIds.length !== nextIds.length || currentIds.some((id, i) => id !== nextIds[i])
  })
})

watch(dirty, value => emit('dirty-change', value), { immediate: true })

async function commit(): Promise<void> {
  const record = draftRecord()
  // An empty selection is sent as `null`, the record's own "nothing is
  // customer-editable" value, so a cleared list and a never-curated template
  // read identically in storage instead of as `{}` versus `null`.
  await store.setCuration(Object.keys(record).length > 0 ? record : null)
}

/**
 * `getLocalizedLabel`, not `getSchemaLabel`: the latter falls back to
 * `schema.type`, and a settings field's `type` is its WIDGET ('text', 'select'),
 * so an unlabelled field would list as "text" instead of naming itself.
 */
function fieldLabel(field: BlockSchemaField): string {
  return getLocalizedLabel(field.label) || field.id
}
</script>

<style scoped>
.btc {
  overflow: hidden;
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: var(--cms-radius-card, 10px);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1, 0 1px 2px rgba(33, 30, 25, 0.05));
}

.btc__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cms-sp-4, 16px);
  padding: var(--cms-sp-4, 16px);
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
}

.btc__overline {
  display: block;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-overline, 11px);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;
}

.btc__title { margin: 3px 0 0; color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-lg, 16px); font-weight: 700; line-height: 1.3; letter-spacing: -0.01em; }
.btc__copy { max-width: 660px; margin: 4px 0 0; color: var(--cms-ink-muted, var(--cms-ink-muted)); font-size: var(--cms-fs-caption, 12px); line-height: 1.5; }
.btc__summary { flex: 0 0 auto; padding: 4px 8px; border-radius: var(--cms-radius-pill, 999px); color: var(--cms-accent-pressed, var(--cms-accent-pressed)); background: var(--cms-accent-soft, var(--cms-accent-soft)); font-size: 11px; font-weight: 700; white-space: nowrap; }
.btc__body { padding: var(--cms-sp-4, 16px); }

.btc__picker { display: flex; flex-direction: column; gap: 6px; margin: 0 0 var(--cms-sp-4, 16px); color: var(--cms-ink, var(--cms-ink)); font-size: var(--cms-fs-sm, 13px); font-weight: 600; }

.btc__block {
  min-width: 0;
  margin: 0;
  padding: var(--cms-sp-3, 12px) var(--cms-sp-4, 16px) var(--cms-sp-4, 16px);
  border: 1px solid var(--cms-line, var(--cms-line));
  border-radius: 8px;
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.btc__block-label { max-width: calc(100% - 16px); padding: 0 6px; overflow: hidden; color: var(--cms-ink, var(--cms-ink)); background: var(--cms-surface); font-size: var(--cms-fs-sm, 13px); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.btc__block-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-bottom: var(--cms-sp-2, 8px); }
.btc__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }

.btc__field {
  display: flex;
  align-items: center;
  gap: var(--cms-sp-2, 8px);
  min-height: 38px;
  padding: 7px var(--cms-sp-2, 8px);
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font-size: var(--cms-fs-sm, 13px);
  line-height: 1.35;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .btc__field:hover { border-color: var(--cms-line-strong, var(--cms-line-strong)); }
}

.btc__field input { width: 16px; height: 16px; margin: 0; accent-color: var(--cms-accent, var(--cms-accent)); }
.btc__notice { display: flex; align-items: flex-start; gap: var(--cms-sp-2, 8px); margin: var(--cms-sp-3, 12px) 0 0; padding: var(--cms-sp-2, 8px) var(--cms-sp-3, 12px); border-radius: 6px; color: var(--cms-warn, var(--cms-warn)); background: var(--cms-warn-soft); font-size: var(--cms-fs-caption, 12px); line-height: 1.5; }
.btc__notice .material-icons-outlined { flex: 0 0 auto; font-size: 16px; }

.btc__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-3, 12px);
  padding: var(--cms-sp-3, 12px) var(--cms-sp-4, 16px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.btc__action-buttons { display: flex; align-items: center; gap: var(--cms-sp-2, 8px); }
.btc__save-state { display: inline-flex; align-items: center; gap: 6px; color: var(--cms-accent-pressed, var(--cms-accent-pressed)); font-size: var(--cms-fs-caption, 12px); font-weight: 600; }
.btc__save-state--dirty { color: var(--cms-warn, var(--cms-warn)); }
.btc__save-state .material-icons-outlined { font-size: 16px; }
.btc__empty { display: flex; align-items: center; gap: var(--cms-sp-2, 8px); margin: 0; padding: var(--cms-sp-4, 16px); color: var(--cms-ink-muted, var(--cms-ink-muted)); background: var(--cms-surface-subtle, var(--cms-surface-subtle)); font-size: var(--cms-fs-sm, 13px); line-height: 1.5; }
.btc__empty .material-icons-outlined { flex: 0 0 auto; font-size: 18px; }
.btc__error { margin: 0; padding: var(--cms-sp-2, 8px) var(--cms-sp-4, 16px); color: var(--cms-danger, var(--cms-danger)); background: var(--cms-danger-soft, var(--cms-danger-soft)); font-size: var(--cms-fs-caption, 12px); line-height: 1.45; }

@container (max-width: 620px) {
  .btc__fields { grid-template-columns: minmax(0, 1fr); }
  .btc__actions { align-items: stretch; flex-direction: column; }
  .btc__action-buttons { width: 100%; }
  .btc__action-buttons .cms-btn { flex: 1 1 0; }
}
</style>
