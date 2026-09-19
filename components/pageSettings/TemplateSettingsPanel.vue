<template>
  <section class="cms-card template-settings-panel" data-section="template-settings">
    <div class="cms-card__header">
      <h3 class="cms-card__title">Template Settings</h3>
      <span class="template-settings-panel__template-id">{{ template.id }}</span>
      <span v-if="saveState === 'saving'" class="template-settings-panel__status template-settings-panel__status--saving">Saving…</span>
      <span v-else-if="saveState === 'saved'" class="template-settings-panel__status template-settings-panel__status--saved">Saved</span>
      <span v-else-if="saveState === 'error'" class="template-settings-panel__status template-settings-panel__status--error" role="alert">Save failed</span>
      <span v-else-if="saveState === 'blocked'" class="template-settings-panel__status template-settings-panel__status--error">Fix errors</span>
      <span v-else-if="isDirty" class="template-settings-panel__status template-settings-panel__status--dirty">Unsaved</span>
    </div>
    <div class="cms-card__body">
      <FormRenderer
        :schema="settingsSchema"
        :model-value="draftSettings"
        @update:model-value="onChange"
        @validation-error="onValidationError"
        @validity-change="onValidityChange"
      />

      <div
        v-if="saveState === 'blocked'"
        ref="validationNotice"
        class="template-settings-panel__error"
        role="status"
        tabindex="-1"
      >
        Fix {{ validationErrorCount }} invalid
        {{ validationErrorCount === 1 ? 'setting' : 'settings' }} before saving.
      </div>

      <div v-if="saveError" class="template-settings-panel__error" role="alert">
        {{ saveError }}
      </div>

      <div class="template-settings-panel__actions">
        <button
          type="button"
          class="cms-btn cms-btn--primary"
          :disabled="!isDirty || saveState === 'saving'"
          @click="onSave"
        >
          {{ saveButtonLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * TemplateSettingsPanel — admin-only design knobs for templated pages
 * (Blog-2 task 2.F.1).
 *
 * Renders the active template's `settingsSchema` over `pages.template_settings`,
 * saves through the admin endpoint:
 *   PUT /api/admin/s/:siteId/pages/:pageId/template-settings
 *
 * The editor change coordinator owns dirty state, autosave, retries, and
 * navigation flushing. The manual button remains as an explicit save-now
 * affordance and flushes the same keyed job.
 *
 * Other simplicity choices (vs `useArticleEditor`):
 *  - No history undo/redo (parent settings panel owns that for blocks).
 *  - No locale switcher (provided by ancestor SettingsPanel via inject).
 *  - Server-side strict-submit + preserve-existing semantics; we send the
 *    full draft and let the endpoint drop unknowns / preserve legacy.
 *
 * Standalone-safe: every input arrives as a prop and the only store it touches
 * is the global `editorChangeStore`. It is mounted from two hosts — the
 * page-builder `SettingsPanel` and the article editor page — and must not grow
 * a dependency on `editorStore`.
 *
 * RBAC: rendering gated upstream (each host checks `authStore.isAdmin`).
 * The endpoint itself is admin-only via `ADMIN_ONLY_PATTERNS` in
 * `server/services/auth/rbac.ts` — defense in depth.
 *
 * Preview refresh: emits the authoritative settings after the current PUT.
 * The parent mirrors that payload into the page draft, which feeds the
 * existing config-update preview flow without rehydrating the whole editor.
 */
import { ref, computed, watch, provide, nextTick } from 'vue'
import FormRenderer from '~/admin/components/fields/FormRenderer.vue'
import { adminFetch } from '~/admin/utils/adminFetch'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'
import type { PageTemplate } from '~/shared/types/templates'
import type { TemplateFieldSchema } from '~/shared/types/blog2-content'

const props = defineProps<{
  /** Page id (used in the PUT URL). */
  pageId: string
  /** Site id (used in the PUT URL). */
  siteId: string
  /** Resolved active template — must have a non-empty `settingsSchema`. */
  template: PageTemplate
  /** Current `pages.template_settings` value (server source-of-truth). */
  templateSettings: Record<string, any> | null
  /** Editing locale — provided to descendant fields for localized values. */
  locale: string
}>()

const emit = defineEmits<{
  saved: [result: { pageId: string; templateSettings: Record<string, any> }]
  /**
   * Every draft edit, before any save round-trip. Consumers that can render
   * unsaved settings (the article editor's preview pane) subscribe to this;
   * the page-builder settings panel ignores it and waits for `saved`.
   */
  'update:draft': [draft: { pageId: string; templateSettings: Record<string, any> }]
}>()
const changes = useEditorChangeStore()

// settingsSchema is guaranteed non-empty by the parent's render gate. Defensive
// cast keeps TS happy while we deref.
const settingsSchema = computed<TemplateFieldSchema[]>(
  () => props.template.settingsSchema ?? [],
)

// Provide the editing locale + siteId to descendant fields (TImagePicker etc.)
// so localized text + media pickers resolve correctly.
provide('editingLocale', computed(() => props.locale))
provide('siteId', computed(() => props.siteId))
// Match Article authoring: media stored as IDs (per Blog-2 spec).
provide('imageValueMode', ref<'id' | 'url'>('id'))

/** Stable snapshot for draft reconciliation. Dirty state lives in the coordinator. */
function snapshot(value: unknown): string {
  return JSON.stringify(value ?? {}, replacerSortKeys)
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

// Draft + last confirmed server value. The baseline is reconciliation data,
// not a second dirty-state source.
const draftSettings = ref<Record<string, any>>(clone(props.templateSettings ?? {}))
const confirmedSettings = ref<Record<string, any>>(clone(props.templateSettings ?? {}))
const templateJobKey = computed(() => editorChangeKey.templateSettings(props.pageId))
const templateJob = computed(() => changes.getJob(templateJobKey.value))
const isDirty = computed(() => templateJob.value?.dirty ?? false)

function clone<T>(v: T): T {
  return v === undefined || v === null ? v : JSON.parse(JSON.stringify(v))
}

watch(() => props.pageId, () => {
  // The previous page's closure owns its immutable payload and remains in the
  // coordinator until it succeeds, fails for retry, or navigation discards it.
  const next = clone(props.templateSettings ?? {})
  draftSettings.value = next
  confirmedSettings.value = clone(next)
  validationErrors.value = {}
  isFormValid.value = true
})

watch(() => props.templateSettings, (settings) => {
  // Page hydration and save confirmations can arrive while a newer local
  // revision is queued. Only a clean job may replace the visible draft.
  if (templateJob.value?.dirty || templateJob.value?.saving) return
  const next = clone(settings ?? {})
  draftSettings.value = next
  confirmedSettings.value = clone(next)
}, { deep: true })

// ── Coordinator-backed save state ─────────────────────────────────────────
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'blocked' | 'error'
const saveState = computed<SaveState>(() => {
  const job = templateJob.value
  if (!job) return 'idle'
  if (job.error) return 'error'
  if (job.blockedReason) return 'blocked'
  if (job.saving) return 'saving'
  if (job.dirty) return 'dirty'
  return job.lastSavedAt ? 'saved' : 'idle'
})
const saveError = computed(() => templateJob.value?.error ?? null)
const validationErrors = ref<Record<string, string>>({})
const isFormValid = ref(true)
const validationNotice = ref<HTMLElement | null>(null)
const validationErrorCount = computed(() => Object.keys(validationErrors.value).length)

const saveButtonLabel = computed(() => {
  switch (saveState.value) {
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return 'Retry save'
    case 'blocked': return 'Fix errors'
    default: return 'Save'
  }
})

function onChange(next: Record<string, any>) {
  draftSettings.value = clone(next)
  emit('update:draft', {
    pageId: props.pageId,
    templateSettings: clone(draftSettings.value),
  })

  const revertedToConfirmed = snapshot(next) === snapshot(confirmedSettings.value)
  if (revertedToConfirmed && !templateJob.value?.saving) {
    changes.discardJob(templateJobKey.value)
    return
  }

  queueTemplateSave()
}

async function onSave() {
  await changes.flushJob(templateJobKey.value, true)
}

function queueTemplateSave(): void {
  const pageId = props.pageId
  const siteId = props.siteId
  const key = editorChangeKey.templateSettings(pageId)
  const scope = editorChangeScope.page(pageId)
  const submittedSettings = clone(draftSettings.value)

  changes.queue({
    key,
    surface: 'page',
    scope,
    label: 'Template settings',
    delay: 800,
    valid: isFormValid.value,
    blockedReason: 'Fix invalid template settings before saving',
    focusInvalid: focusValidationNotice,
    run: async ({ isCurrent }) => {
      let response: { templateSettings?: Record<string, any> }
      try {
        response = await adminFetch<{ templateSettings?: Record<string, any> }>(
          `/api/admin/s/${siteId}/pages/${pageId}/template-settings`,
          {
            method: 'PUT',
            body: { templateSettings: clone(submittedSettings) },
          },
        )
      } catch (error: any) {
        throw new Error(
          error?.data?.statusMessage
          ?? error?.statusMessage
          ?? error?.message
          ?? 'Save failed',
        )
      }

      // A response for a page that is no longer open still belongs to that
      // coordinator job, but must not touch the new page's local refs.
      if (props.pageId !== pageId) return
      const authoritativeSettings = clone(response.templateSettings ?? submittedSettings)
      confirmedSettings.value = authoritativeSettings

      // A newer revision may have been edited while this request was in
      // flight. Leave that draft visible; its queued callback will persist it.
      if (!isCurrent()) return
      draftSettings.value = clone(authoritativeSettings)
      emit('saved', {
        pageId,
        templateSettings: clone(authoritativeSettings),
      })
    },
  })
}

function onValidationError(fieldId: string, error: string | null): void {
  if (error) validationErrors.value[fieldId] = error
  else delete validationErrors.value[fieldId]
}

function onValidityChange(valid: boolean, errors: Record<string, string>): void {
  isFormValid.value = valid
  validationErrors.value = { ...errors }
  changes.setValidity(
    templateJobKey.value,
    valid,
    'Fix invalid template settings before saving',
    focusValidationNotice,
  )
}

function focusValidationNotice(): void {
  nextTick(() => validationNotice.value?.focus())
}
</script>

<style scoped>
.template-settings-panel__template-id {
  font-size: 11px;
  font-family: monospace;
  color: var(--cms-ink-muted);
  background: var(--cms-surface-subtle);
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.template-settings-panel__status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: auto;
}

.template-settings-panel__status--saving {
  color: var(--cms-accent);
}

.template-settings-panel__status--saved {
  color: #28a745;
}

.template-settings-panel__status--error {
  color: var(--cms-danger);
}

.template-settings-panel__status--dirty {
  color: var(--cms-warn);
  background: var(--cms-warn-soft);
}

.template-settings-panel__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.template-settings-panel__error {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--cms-danger-soft);
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: var(--cms-danger);
  font-size: 12px;
}
</style>
