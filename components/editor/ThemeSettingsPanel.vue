<template>
  <div class="theme-settings">
    <!-- Global settings context -->
    <div class="theme-settings__header">
      <div class="theme-settings__nav-row">
        <button class="theme-settings__back" type="button" @click="goBack">
          <span class="material-icons-outlined" aria-hidden="true">arrow_back</span>
          Page editor
        </button>
        <button
          v-if="saveStatus === 'error' && isFormValid"
          type="button"
          class="theme-settings__save-state theme-settings__save-state--error"
          @click="retryThemeSave"
        >
          <span class="material-icons-outlined" aria-hidden="true">sync_problem</span>
          Retry save
        </button>
        <span v-if="saveStatus === 'error' && isFormValid" class="theme-settings__sr-only" role="alert">
          Theme settings failed to save.
        </span>
        <span
          v-else
          class="theme-settings__save-state"
          :class="`theme-settings__save-state--${saveStateTone}`"
          aria-live="polite"
        >
          <span class="material-icons-outlined" aria-hidden="true">{{ saveStateIcon }}</span>
          {{ saveStateLabel }}
        </span>
      </div>

      <div class="theme-settings__heading">
        <span class="material-icons-outlined theme-settings__heading-icon" aria-hidden="true">palette</span>
        <div>
          <span class="theme-settings__eyebrow">{{ t('admin.editor.designSystem', 'Design system') }}</span>
          <h2>{{ t('admin.editor.siteStyles', 'Site styles') }}</h2>
          <p class="theme-settings__desc">{{ t('admin.editor.stylesDescription', 'Colors, typography, and global options for the entire website.') }}</p>
        </div>
      </div>

      <div class="theme-settings__meta" aria-label="Site styles summary">
        <span>
          <span class="material-icons-outlined" aria-hidden="true">tune</span>
          {{ settingCount }} {{ settingCount === 1 ? 'setting' : 'settings' }}
        </span>
        <span>
          <span class="material-icons-outlined" aria-hidden="true">bolt</span>
          Live preview
        </span>
      </div>
    </div>

    <!-- Scrollable settings area -->
    <div class="theme-settings__content">
      <div
        v-if="!isFormValid"
        ref="validationNotice"
        class="theme-settings__validation-notice"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabindex="-1"
      >
        <span class="material-icons-outlined" aria-hidden="true">error_outline</span>
        <div>
          <strong>{{ t('admin.editor.autosavePaused', 'Autosave paused') }}</strong>
          <span>
            Fix {{ validationErrorCount }} invalid
            {{ validationErrorCount === 1 ? 'setting' : 'settings' }} to continue saving.
          </span>
          <ul class="theme-settings__validation-list">
            <li v-for="item in validationErrorItems" :key="item.id">
              <strong>{{ item.label }}:</strong> {{ item.error }}
            </li>
          </ul>
        </div>
      </div>

      <FormRenderer
        v-if="store.themeSettingsSchema && store.themeSettingsSchema.length > 0"
        :schema="store.themeSettingsSchema"
        :groups="store.themeSettingsGroups"
        :model-value="localSettings"
        @update:model-value="onSettingsChange"
        @validation-error="onValidationError"
        @validity-change="onValidityChange"
      />
      <div v-else class="theme-settings__empty">
        <p>{{ t('admin.editor.noStyles', 'This design has no editable site-wide styles.') }}</p>
      </div>

      <!-- Custom fonts (SPL-115) — only rendered when the server-side
           feature flag reports fonts available. The manager self-fetches
           on mount so no extra wiring is needed here. -->
      <div v-if="store.fontsAvailable" class="theme-settings__fonts">
        <FontManager />
      </div>
    </div>

    <!-- Reserved footer keeps save feedback from shifting the inspector. -->
    <div class="theme-settings__footer" :class="{ 'theme-settings__footer--invalid': !isFormValid }">
      <span class="material-icons-outlined" aria-hidden="true">{{ isFormValid ? 'info' : 'error_outline' }}</span>
      <span v-if="isFormValid">{{ t('admin.editor.previewAutosaves', 'Preview updates immediately. Changes save automatically.') }}</span>
      <span v-else>{{ t('admin.editor.previewTemporary', 'Preview is temporary until every invalid setting is fixed.') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { ref, watch, provide, computed, onMounted, nextTick } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'
import { useAdminFontFaces } from '~/admin/composables/useAdminFontFaces'
import FormRenderer from '~/admin/components/fields/FormRenderer.vue'
import FontManager from '~/admin/components/typography/FontManager.vue'
import { getFieldLabel } from '~/admin/utils/labelUtils'
import {
  MEDIA_UPLOAD_OPERATION_KEY,
  type MediaUploadOperation,
} from '~/admin/components/fields/mediaUpload'

const store = useEditorStore()
const { t } = useAdminI18n()
const changeStore = useEditorChangeStore()

// Inject @font-face rules into the admin document so the font-family
// picker previews uploaded fonts correctly without waiting for publish.
useAdminFontFaces()

// Kick off a fonts fetch alongside theme settings so the font-family
// picker has the full list available as soon as the panel opens.
onMounted(() => {
  if (!store.fontsLoaded) store.fetchFonts()
})

// Local settings state
const localSettings = ref<Record<string, any>>({})
const savedSettings = ref<Record<string, any>>({})
const pendingSettings = ref<Record<string, any>>({})
const AUTOSAVE_DELAY = 800
let activeSubmission: Record<string, any> = {}
const themeJobKey = computed(() => editorChangeKey.theme(store.siteId || 'unknown'))
const themeScope = computed(() => editorChangeScope.site(store.siteId || 'unknown'))
const themeJob = computed(() => changeStore.getJob(themeJobKey.value))
const mediaUploadOperation = computed<MediaUploadOperation | undefined>(() => {
  const siteId = store.siteId
  if (!siteId) return undefined
  return {
    key: `theme:${siteId}:media`,
    surface: 'theme',
    scope: editorChangeScope.site(siteId),
    label: 'Site style image upload',
  }
})
const isDirty = computed(() => themeJob.value?.dirty ?? false)
const saveStatus = computed<'idle' | 'saving' | 'error'>(() => {
  if (themeJob.value?.error) return 'error'
  if (themeJob.value?.saving) return 'saving'
  return 'idle'
})

// Validation
const validationErrors = ref<Record<string, string>>({})
const isFormValid = ref(true)
const validationNotice = ref<HTMLElement | null>(null)
const validationErrorCount = computed(() => Object.keys(validationErrors.value).length)
const validationErrorItems = computed(() => Object.entries(validationErrors.value).map(([id, error]) => {
  const field = store.themeSettingsSchema?.find((candidate: any) => String(candidate.id) === id)
  return {
    id,
    error,
    label: field ? getFieldLabel(field) : id,
  }
}))

function focusValidationNotice(): void {
  nextTick(() => validationNotice.value?.focus())
}

defineExpose({ focusValidationNotice })

const settingCount = computed(() => store.themeSettingsSchema?.length ?? 0)
const saveStateLabel = computed(() => {
  if (!isFormValid.value) {
    return `Fix ${validationErrorCount.value} ${validationErrorCount.value === 1 ? 'setting' : 'settings'}`
  }
  if (saveStatus.value === 'saving') return 'Saving'
  if (isDirty.value) return 'Unsaved changes'
  return 'Up to date'
})
const saveStateTone = computed(() => {
  if (!isFormValid.value) return 'invalid'
  if (saveStatus.value === 'saving') return 'saving'
  if (isDirty.value) return 'dirty'
  return 'idle'
})
const saveStateIcon = computed(() => {
  if (!isFormValid.value) return 'error_outline'
  if (saveStatus.value === 'saving') return 'sync'
  if (isDirty.value) return 'edit'
  return 'check_circle'
})

// Provide schemas, siteId, themeManifest, and editing locale to FormRenderer children
provide('blockSchemas', computed(() => store.schemas))
provide('siteId', computed(() => store.siteId))
provide('themeManifest', computed(() => store.themeManifest))
provide('editingLocale', computed(() => store.editingLocale))
provide('typographyPresets', computed(() => store.typographyPresets))
provide(MEDIA_UPLOAD_OPERATION_KEY, mediaUploadOperation)

// Sync from store when theme settings change externally
watch(() => store.themeSettings, (settings) => {
  // Draft preview updates and save confirmations both flow through this ref.
  // Never replace newer local edits while an autosave is in flight.
  if (isDirty.value) return
  const nextSettings = { ...settings }
  localSettings.value = nextSettings
  savedSettings.value = nextSettings
  pendingSettings.value = {}
}, { immediate: true })

async function goBack() {
  await store.deselectAll()
}

function onSettingsChange(newSettings: Record<string, any>) {
  const previousSettings = localSettings.value
  const touchedKeys = new Set([
    ...Object.keys(previousSettings),
    ...Object.keys(newSettings),
  ])

  const nextPending = { ...pendingSettings.value }
  for (const key of touchedKeys) {
    if (valuesEqual(previousSettings[key], newSettings[key])) continue
    const comparisonValue = Object.prototype.hasOwnProperty.call(activeSubmission, key)
      ? activeSubmission[key]
      : savedSettings.value[key]
    if (valuesEqual(comparisonValue, newSettings[key])) {
      delete nextPending[key]
    } else {
      nextPending[key] = newSettings[key]
    }
  }

  localSettings.value = newSettings
  pendingSettings.value = nextPending

  // Preview is intentionally synchronous; only persistence is debounced.
  store.previewThemeSettings(newSettings)

  if (Object.keys(nextPending).length > 0) {
    queueThemeSave()
  } else {
    // Reverting a queued (but not in-flight) draft to the confirmed baseline
    // should cancel that obsolete write. An active submission is left alone;
    // the pending-diff algorithm above queues a compensating revision when the
    // user actually reverted a value that request is changing.
    if (!themeJob.value?.saving) changeStore.discardJob(themeJobKey.value)
  }
}

function valuesEqual(left: any, right: any): boolean {
  if (Object.is(left, right)) return true
  if (
    left && right
    && typeof left === 'object'
    && typeof right === 'object'
  ) {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return false
}

function diffSettings(
  baseline: Record<string, any>,
  current: Record<string, any>,
): Record<string, any> {
  const changes: Record<string, any> = {}
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)])
  for (const key of keys) {
    if (!valuesEqual(baseline[key], current[key])) {
      changes[key] = current[key]
    }
  }
  return changes
}

function onValidationError(fieldId: string, error: string | null) {
  if (error) {
    validationErrors.value[fieldId] = error
  } else {
    delete validationErrors.value[fieldId]
  }
}

function onValidityChange(valid: boolean, errors: Record<string, string>) {
  const wasValid = isFormValid.value
  isFormValid.value = valid
  validationErrors.value = { ...errors }

  if (!valid) {
    changeStore.setValidity(
      themeJobKey.value,
      false,
      'Fix invalid site styles before saving',
      focusValidationNotice,
    )
    return
  }

  if (!wasValid) changeStore.setValidity(themeJobKey.value, true)
}

function queueThemeSave() {
  const submittedSettings = { ...pendingSettings.value }
  if (Object.keys(submittedSettings).length === 0) return

  changeStore.queue({
    key: themeJobKey.value,
    surface: 'theme',
    scope: themeScope.value,
    label: 'Site styles',
    delay: AUTOSAVE_DELAY,
    valid: isFormValid.value,
    blockedReason: 'Fix invalid site styles before saving',
    focusInvalid: focusValidationNotice,
    run: async ({ isCurrent }) => {
      activeSubmission = submittedSettings
      try {
        await store.updateThemeSettings(submittedSettings)
        const confirmedSettings = { ...store.themeSettings }
        savedSettings.value = confirmedSettings

        if (isCurrent()) {
          const remainingSettings = { ...pendingSettings.value }
          for (const [key, value] of Object.entries(submittedSettings)) {
            if (valuesEqual(remainingSettings[key], value)) delete remainingSettings[key]
          }
          pendingSettings.value = remainingSettings
          if (Object.keys(remainingSettings).length === 0) {
            localSettings.value = confirmedSettings
          }
        } else {
          // The confirmed response may have replaced the preview while a newer
          // revision is pending. Restore that newer local draft immediately.
          pendingSettings.value = diffSettings(confirmedSettings, localSettings.value)
          store.previewThemeSettings(localSettings.value)
        }
      } catch (error) {
        pendingSettings.value = diffSettings(savedSettings.value, localSettings.value)
        throw error
      } finally {
        activeSubmission = {}
      }
    },
  })
}

function retryThemeSave() {
  void changeStore.flushJob(themeJobKey.value, true)
}
</script>

<style scoped>
.theme-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--cms-ink, var(--cms-ink));
  background: var(--cms-surface);
}

.theme-settings__header {
  flex-shrink: 0;
  padding: var(--cms-sp-4, 16px);
  border-bottom: 1px solid var(--cms-line, var(--cms-line));
  background: var(--cms-surface);
}

.theme-settings__nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: var(--cms-sp-2, 8px);
}

.theme-settings__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 7px 0 4px;
  border: 0;
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: transparent;
  font-family: inherit;
  font-size: var(--cms-fs-caption, 12px);
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.theme-settings__back .material-icons-outlined {
  font-size: 16px;
}

@media (hover: hover) and (pointer: fine) {
  .theme-settings__back:hover {
    color: var(--cms-ink, var(--cms-ink));
    background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  }
}

.theme-settings__back:active {
  transform: scale(0.97);
}

.theme-settings__save-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--cms-radius-pill, 999px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.theme-settings__save-state .material-icons-outlined {
  font-size: 14px;
}

.theme-settings__save-state--saving {
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
}

.theme-settings__save-state--saving .material-icons-outlined {
  animation: theme-settings-spin 0.8s linear infinite;
}

.theme-settings__save-state--saved,
.theme-settings__save-state--idle {
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-softest, var(--cms-accent-softest));
}

.theme-settings__save-state--dirty {
  color: var(--cms-warn);
  background: var(--cms-warn-soft);
}

.theme-settings__save-state--invalid {
  color: var(--cms-danger, var(--cms-danger));
  background: var(--cms-danger-soft, var(--cms-danger-soft));
}

.theme-settings__save-state--error {
  border-color: rgba(158, 43, 37, 0.24);
  color: var(--cms-danger, var(--cms-danger));
  background: var(--cms-danger-soft, var(--cms-danger-soft));
  cursor: pointer;
}

.theme-settings__heading {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: var(--cms-sp-3, 12px);
  align-items: start;
  margin-top: var(--cms-sp-4, 16px);
}

.theme-settings__heading-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-soft, var(--cms-accent-soft));
  font-size: 18px;
}

.theme-settings__eyebrow {
  display: block;
  margin-bottom: 3px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-overline, 11px);
  font-weight: 700;
  letter-spacing: 0.09em;
  line-height: 1.2;
  text-transform: uppercase;
}

.theme-settings__header h2 {
  margin: 0;
  color: var(--cms-ink, var(--cms-ink));
  font-size: var(--cms-fs-h3, 18px);
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.theme-settings__desc {
  margin: var(--cms-sp-1, 4px) 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.5;
}

.theme-settings__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-sp-3, 12px);
  margin-top: var(--cms-sp-4, 16px);
  padding-top: var(--cms-sp-3, 12px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: 11px;
  font-weight: 600;
}

.theme-settings__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.theme-settings__meta .material-icons-outlined {
  font-size: 14px;
}

.theme-settings__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--cms-sp-4, 16px);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.theme-settings__validation-notice {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: var(--cms-sp-2, 8px);
  align-items: start;
  margin-bottom: var(--cms-sp-4, 16px);
  padding: var(--cms-sp-3, 12px);
  border: 1px solid color-mix(in srgb, var(--cms-danger, #9e2b25) 28%, transparent);
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-danger, var(--cms-danger));
  background: var(--cms-danger-soft, var(--cms-danger-soft));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}

.theme-settings__validation-notice:focus-visible {
  outline: 2px solid var(--cms-danger, var(--cms-danger));
  outline-offset: 2px;
}

.theme-settings__validation-notice > .material-icons-outlined {
  margin-top: 1px;
  font-size: 18px;
}

.theme-settings__validation-notice strong,
.theme-settings__validation-notice span {
  display: block;
}

.theme-settings__validation-notice strong {
  margin-bottom: 2px;
  font-size: var(--cms-fs-sm, 13px);
}

.theme-settings__validation-list {
  display: grid;
  gap: 2px;
  margin: var(--cms-sp-2, 8px) 0 0;
  padding-left: 18px;
}

.theme-settings__validation-list strong {
  display: inline;
  margin: 0;
  font-size: inherit;
}

.theme-settings__fonts {
  margin-top: var(--cms-sp-5, 24px);
  padding-top: var(--cms-sp-5, 24px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
}

.theme-settings__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 180px;
  padding: var(--cms-sp-5, 24px);
  border: 1px dashed var(--cms-line-strong, var(--cms-line-strong));
  border-radius: var(--cms-radius-card, 10px);
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-size: var(--cms-fs-sm, 13px);
  text-align: center;
}

.theme-settings__footer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 42px;
  padding: 0 var(--cms-sp-4, 16px);
  border-top: 1px solid var(--cms-line, var(--cms-line));
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-size: 11px;
  line-height: 1.35;
}

.theme-settings__footer .material-icons-outlined {
  flex: 0 0 auto;
  color: currentColor;
  font-size: 15px;
}

.theme-settings__footer--invalid {
  color: var(--cms-danger, var(--cms-danger));
  background: var(--cms-danger-soft, var(--cms-danger-soft));
}

.theme-settings__sr-only {
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

@keyframes theme-settings-spin {
  to { transform: rotate(360deg); }
}
</style>
