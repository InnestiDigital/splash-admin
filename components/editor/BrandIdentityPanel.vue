<template>
  <div class="brand-panel">
    <p class="brand-panel__intro">
      The brand identity every generated asset uses. Palette and typography are bound to
      theme roles — re-theming the site re-brands generated assets automatically.
    </p>

    <div v-if="store.presetsLoading" class="brand-panel__loading">{{ t('admin.brand.loadingPresets', 'Loading presets…') }}</div>

    <!--
      A site nobody has authored yet owns NO preset rows. Rather than let the
      identity form edit a record that does not exist — which is what made the
      first Save silently mint a preset named 'Default' nobody chose — the panel
      asks for a name first. Everything below then edits a real preset.
    -->
    <div v-else-if="!hasPresets" class="brand-panel__presets brand-panel__presets--empty">
      <p class="brand-panel__empty-copy">
        This site has no brand presets yet. Name one to start — it opens on the theme's
        colours and type roles, and every field is yours to change.
      </p>
      <form class="brand-panel__presets-form" @submit.prevent="createFirstPreset">
        <input
          v-model="firstPresetName"
          class="brand-panel__presets-input"
          type="text"
          :maxlength="BRAND_PRESET_NAME_MAX_LENGTH"
          :placeholder="t('admin.brand.presetName', 'Preset name')"
          aria-label="Name for the first brand preset"
        >
        <button
          class="cms-btn cms-btn--primary cms-btn--sm"
          type="submit"
          :disabled="store.presetMutating || firstPresetName.trim().length === 0"
        >
          <span v-if="store.presetMutating">Creating…</span>
          <span v-else>{{ t('admin.brand.createPreset', 'Create preset') }}</span>
        </button>
      </form>
      <div v-if="store.presetsError" class="brand-panel__error" role="alert">{{ store.presetsError }}</div>
    </div>

    <div v-else class="brand-panel__presets">
      <div class="brand-panel__presets-row">
        <label class="brand-panel__presets-label" for="brand-preset-select">{{ t('admin.brand.brandPreset', 'Brand preset') }}</label>
        <select
          id="brand-preset-select"
          class="brand-panel__presets-select"
          :value="store.activePresetId ?? ''"
          :disabled="store.presetMutating || presetForm.kind !== 'idle'"
          @change="onPresetSelect"
        >
          <option
            v-for="(preset, index) in store.presets"
            :key="preset.presetId"
            :value="preset.presetId"
          >
            {{ preset.presetName }}{{ defaultSuffix(preset.presetName, index) }}
          </option>
        </select>
        <template v-if="presetForm.kind === 'idle'">
          <button
            class="cms-btn cms-btn--secondary cms-btn--sm"
            :disabled="store.presetMutating"
            @click="openPresetForm('create')"
          >{{ t('admin.brand.new', 'New') }}</button>
          <button
            class="cms-btn cms-btn--secondary cms-btn--sm"
            :disabled="store.presetMutating || !activePreset"
            @click="openPresetForm('duplicate')"
          >{{ t('admin.brand.duplicate', 'Duplicate') }}</button>
          <button
            class="cms-btn cms-btn--secondary cms-btn--sm"
            :disabled="store.presetMutating || !activePreset"
            @click="openPresetForm('rename')"
          >{{ t('admin.brand.rename', 'Rename') }}</button>
          <button
            class="cms-btn cms-btn--danger-quiet cms-btn--sm"
            :disabled="store.presetMutating || !activePreset"
            @click="openPresetForm('confirm-delete')"
          >{{ t('common.delete', 'Delete') }}</button>
        </template>
      </div>

      <form
        v-if="presetForm.kind === 'create' || presetForm.kind === 'duplicate' || presetForm.kind === 'rename'"
        class="brand-panel__presets-form"
        @submit.prevent="confirmPresetForm"
      >
        <input
          v-model="presetNameDraft"
          class="brand-panel__presets-input"
          type="text"
          :maxlength="BRAND_PRESET_NAME_MAX_LENGTH"
          :placeholder="presetFormLabel"
          :aria-label="presetFormLabel"
        >
        <button
          class="cms-btn cms-btn--primary cms-btn--sm"
          type="submit"
          :disabled="store.presetMutating || presetNameDraft.trim().length === 0"
        >{{ t('admin.brand.confirm', 'Confirm') }}</button>
        <button
          class="cms-btn cms-btn--secondary cms-btn--sm"
          type="button"
          :disabled="store.presetMutating"
          @click="closePresetForm"
        >{{ t('admin.shared.cancel', 'Cancel') }}</button>
      </form>

      <div v-else-if="presetForm.kind === 'confirm-delete'" class="brand-panel__presets-form">
        <span class="brand-panel__presets-confirm">Delete "{{ activePreset?.presetName }}"?</span>
        <button
          class="cms-btn cms-btn--danger-quiet cms-btn--sm"
          :disabled="store.presetMutating"
          @click="confirmPresetForm"
        >{{ t('admin.brand.confirmDelete', 'Confirm delete') }}</button>
        <button
          class="cms-btn cms-btn--secondary cms-btn--sm"
          :disabled="store.presetMutating"
          @click="closePresetForm"
        >{{ t('admin.shared.cancel', 'Cancel') }}</button>
      </div>

      <div v-if="dirtyBlocked" class="brand-panel__presets-guard">
        <span>{{ dirtyBlockedMessage }}</span>
        <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="discardEdits">{{ t('admin.brand.discard', 'Discard changes') }}</button>
      </div>

      <div v-if="store.presetsError" class="brand-panel__error" role="alert">{{ store.presetsError }}</div>
    </div>

    <div v-if="store.loading && hasPresets" class="brand-panel__loading">Loading...</div>

    <div v-if="store.error && hasPresets" class="brand-panel__error" role="alert">{{ store.error }}</div>

    <template v-if="!store.loading && local && hasPresets">
      <FormRenderer
        :schema="store.schema"
        :groups="store.groups"
        :model-value="local"
        @update:model-value="onIdentityUpdate"
      />

      <div class="brand-panel__actions">
        <span v-if="dirty" class="brand-panel__status brand-panel__status--dirty">{{ t('admin.brand.unsaved', 'Unsaved changes') }}</span>
        <span v-else-if="justSaved" class="brand-panel__status brand-panel__status--saved">{{ t('admin.shared.saved', 'Saved') }}</span>
        <span v-else />
        <button
          class="cms-btn cms-btn--primary"
          :disabled="store.saving || !dirty"
          @click="handleSave"
        >
          <span v-if="store.saving">{{ t('admin.shared.saving', 'Saving…') }}</span>
          <span v-else>{{ t('common.save', 'Save') }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { ref, computed, watch, provide } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useBrandIdentityStore } from '~/admin/stores/brandIdentityStore'
import FormRenderer from '~/admin/components/fields/FormRenderer.vue'
import {
  isBrandLogoFieldId,
  BRAND_PRESET_NAME_MAX_LENGTH,
  type BrandIdentity,
} from '~/shared/types/brand'
import { applyBrandIdentityPrefill } from '~/admin/utils/prefill/adapters/brandIdentity'
import { useAssistantPrefillStore } from '~/admin/stores/assistantPrefillStore'

/** The preset bar's inline form is ONE mode, not four overlapping booleans. */
type PresetFormMode =
  | { kind: 'idle' }
  | { kind: 'create' }
  | { kind: 'duplicate' }
  | { kind: 'rename' }
  | { kind: 'confirm-delete' }

/** Preset actions that would drop unsaved edits and are blocked while dirty. */
type DirtyBlockedAction = 'switch' | 'create' | 'duplicate'

const store = useBrandIdentityStore()
const { t } = useAdminI18n()
const siteStore = useSiteStore()
const prefillStore = useAssistantPrefillStore()

// The logo fields render as TImagePicker (FormRenderer's own mapping for
// `type: 'image'`); it resolves the media library through this injection.
provide('siteId', computed(() => siteStore.activeSiteId ?? ''))

const local = ref<BrandIdentity | null>(null)
const loadedSiteId = ref<string | null>(null)
const loadedPresetId = ref<string | null>(null)
const dirty = ref(false)
const justSaved = ref(false)

const presetForm = ref<PresetFormMode>({ kind: 'idle' })
const presetNameDraft = ref('')
const dirtyBlocked = ref<DirtyBlockedAction | null>(null)

/**
 * The empty state's own name field. Deliberately separate from
 * `presetNameDraft`: that one belongs to the picker's create/rename/duplicate
 * modes, which do not exist until the site has a preset to pick.
 */
const firstPresetName = ref('')

/** No preset rows = nothing to edit yet; the panel asks for a name instead. */
const hasPresets = computed(() => store.presets.length > 0)

async function createFirstPreset(): Promise<void> {
  await store.createPreset(firstPresetName.value)
}

// A re-fetch (mount, or the page switching sites) must not silently throw away
// in-progress edits. Only adopt the server record when the form is clean, or
// when it belongs to a different site OR preset than the one being edited — a
// preset switch is a different record even on the same site.
watch(() => store.identity, (identity) => {
  const incomingSiteId = store.siteId ?? null
  const incomingPresetId = store.activePresetId ?? null
  const sameRecord = loadedSiteId.value !== null
    && loadedSiteId.value === incomingSiteId
    && loadedPresetId.value === incomingPresetId

  if (dirty.value && sameRecord && local.value) return

  loadedSiteId.value = incomingSiteId
  loadedPresetId.value = incomingPresetId
  local.value = identity ? { ...identity } : null
  dirty.value = false
}, { immediate: true })

// Assistant prefill: merge the resolved patch into the working copy and mark
// dirty — the operator reviews and saves; nothing writes without them.
watch(() => store.pendingPrefill, (prefill) => {
  if (!prefill || prefill.kind !== 'admin-context-brand-identity') return
  store.pendingPrefill = null
  if (store.presets.length === 0 || !local.value) {
    prefillStore.report({ applied: [], dropped: ['all fields — create a brand preset first'] })
    return
  }
  const { patch, applied, dropped } = applyBrandIdentityPrefill(prefill, store.schema)
  local.value = { ...local.value, ...patch }
  if (applied.length > 0) dirty.value = true
  prefillStore.report({ applied, dropped })
})

const activePreset = computed(() =>
  store.presets.find(preset => preset.presetId === store.activePresetId)
  ?? store.presets[0]
  ?? null,
)

/**
 * Marks the first entry as the site default. The preset a first save mints is
 * itself named 'Default', so suffixing it would read "Default — Default".
 */
function defaultSuffix(presetName: string, index: number): string {
  return index === 0 && presetName !== 'Default' ? ' — Default' : ''
}

const presetFormLabel = computed(() => {
  const mode = presetForm.value
  switch (mode.kind) {
    case 'create': return 'New preset name'
    case 'duplicate': return 'Duplicate as'
    case 'rename': return 'Rename preset'
    case 'idle':
    case 'confirm-delete':
      return ''
    default: {
      const exhaustive: never = mode
      throw new Error(`Unhandled preset form mode: ${String(exhaustive)}`)
    }
  }
})

const dirtyBlockedMessage = computed(() => {
  const action = dirtyBlocked.value
  switch (action) {
    case 'switch': return 'You have unsaved changes. Save or discard them before switching presets.'
    case 'create': return 'You have unsaved changes. Save or discard them before creating a preset.'
    case 'duplicate': return 'You have unsaved changes. Save or discard them before duplicating this preset.'
    case null: return ''
    default: {
      const exhaustive: never = action
      throw new Error(`Unhandled dirty-blocked action: ${String(exhaustive)}`)
    }
  }
})

function onPresetSelect(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const nextId = target.value
  if (nextId === '' || nextId === store.activePresetId) return
  if (dirty.value) {
    // Snap the native select back — the store, not the DOM, owns the selection.
    target.value = store.activePresetId ?? ''
    dirtyBlocked.value = 'switch'
    return
  }
  dirtyBlocked.value = null
  void store.selectPreset(nextId)
}

function openPresetForm(kind: 'create' | 'duplicate' | 'rename' | 'confirm-delete'): void {
  // Create and duplicate both end by selecting the new preset, which reloads
  // the identity — the same edit-dropping hazard as a plain switch.
  if (dirty.value && (kind === 'create' || kind === 'duplicate')) {
    dirtyBlocked.value = kind
    return
  }
  dirtyBlocked.value = null
  switch (kind) {
    case 'create':
      presetNameDraft.value = ''
      presetForm.value = { kind: 'create' }
      break
    case 'duplicate':
      presetNameDraft.value = activePreset.value
        ? `${activePreset.value.presetName} copy`.slice(0, BRAND_PRESET_NAME_MAX_LENGTH)
        : ''
      presetForm.value = { kind: 'duplicate' }
      break
    case 'rename':
      presetNameDraft.value = activePreset.value?.presetName ?? ''
      presetForm.value = { kind: 'rename' }
      break
    case 'confirm-delete':
      presetNameDraft.value = ''
      presetForm.value = { kind: 'confirm-delete' }
      break
    default: {
      const exhaustive: never = kind
      throw new Error(`Unhandled preset form kind: ${String(exhaustive)}`)
    }
  }
}

function closePresetForm(): void {
  presetForm.value = { kind: 'idle' }
  presetNameDraft.value = ''
}

async function confirmPresetForm(): Promise<void> {
  const mode = presetForm.value
  const active = activePreset.value
  let landed = false
  switch (mode.kind) {
    case 'idle':
      return
    case 'create':
      landed = await store.createPreset(presetNameDraft.value)
      break
    case 'duplicate':
      if (!active) return
      landed = await store.createPreset(presetNameDraft.value, active.presetId)
      break
    case 'rename':
      if (!active) return
      landed = await store.renamePreset(active.presetId, presetNameDraft.value)
      break
    case 'confirm-delete':
      if (!active) return
      landed = await store.deletePreset(active.presetId)
      break
    default: {
      const exhaustive: never = mode
      throw new Error(`Unhandled preset form mode: ${String(exhaustive)}`)
    }
  }
  if (landed) closePresetForm()
}

/** Drops the in-progress edits and reloads the active preset's identity. */
async function discardEdits(): Promise<void> {
  dirty.value = false
  dirtyBlocked.value = null
  await store.fetchIdentity()
}

/**
 * `FormRenderer` emits the WHOLE identity record on every change (one field
 * changed, the rest carried along) — this is the one place that writes an
 * emitted value back into the typed record, moved here from a per-field
 * `setField` so it runs once per `FormRenderer` update instead of once per
 * `DynamicField`. Logo fields are the only nullable ones; every other field is
 * a plain string. Iterating `store.schema` (not `Object.keys(next)`) keeps
 * every key typed as a real `BrandIdentityFieldId` rather than an arbitrary
 * string, so `isBrandLogoFieldId` narrows without a cast.
 */
function onIdentityUpdate(next: Record<string, unknown>): void {
  const current = local.value
  if (!current) return

  for (const field of store.schema) {
    if (!(field.id in next)) continue
    const value = next[field.id]
    if (isBrandLogoFieldId(field.id)) {
      current[field.id] = typeof value === 'string' && value.length > 0 ? value : null
    } else {
      current[field.id] = typeof value === 'string' ? value : ''
    }
  }

  dirty.value = true
  justSaved.value = false
}

async function handleSave(): Promise<void> {
  if (!local.value) return
  const saved = await store.saveIdentity(local.value)
  if (saved) {
    dirty.value = false
    dirtyBlocked.value = null
    justSaved.value = true
  }
}
</script>

<style scoped>
.brand-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.brand-panel__intro {
  margin: 0;
  font-size: 13px;
  color: var(--cms-ink-muted);
  line-height: 1.5;
}

.brand-panel__presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--cms-line);
}

.brand-panel__presets--empty {
  border-bottom: none;
}

.brand-panel__empty-copy {
  margin: 0;
  font-size: 13px;
  color: var(--cms-ink-muted);
  line-height: 1.5;
}

.brand-panel__presets-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.brand-panel__presets-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cms-ink-muted);
}

.brand-panel__presets-select {
  flex: 1;
  min-width: 160px;
  padding: 5px 8px;
  font-size: 13px;
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  background: var(--cms-surface);
}

.brand-panel__presets-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.brand-panel__presets-input {
  flex: 1;
  min-width: 160px;
  padding: 5px 8px;
  font-size: 13px;
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
}

.brand-panel__presets-confirm {
  flex: 1;
  font-size: 13px;
  color: var(--cms-danger);
}

.brand-panel__presets-guard {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--cms-warn);
  background: var(--cms-warn-soft);
  border-radius: 4px;
}

.brand-panel__loading {
  padding: 24px;
  text-align: center;
  color: var(--cms-ink-subtle);
}

.brand-panel__error {
  padding: 12px;
  background: var(--cms-danger-soft);
  color: var(--cms-danger);
  border-radius: 4px;
  font-size: 13px;
}

.brand-panel__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--cms-line);
}

.brand-panel__status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.brand-panel__status--dirty {
  color: var(--cms-warn);
  background: var(--cms-warn-soft);
}

.brand-panel__status--saved {
  color: #28a745;
}
</style>
