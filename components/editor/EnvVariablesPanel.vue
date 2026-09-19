<template>
  <div class="env-panel">
    <!-- Loading -->
    <div v-if="store.loading" class="env-panel__loading">
      Loading...
    </div>

    <!-- Error -->
    <div v-if="store.error" class="env-panel__error">
      {{ store.error }}
    </div>

    <template v-if="!store.loading">
      <!-- Theme-defined variables -->
      <div v-if="definedKeys.length > 0" class="env-panel__section">
        <h3 class="env-panel__section-title">{{ t('admin.data.themeVariables', 'Theme variables') }}</h3>
        <p class="env-panel__section-desc">{{ t('admin.data.themeVariablesDescription', 'Variables expected by the current theme.') }}</p>
        <div class="env-panel__fields">
          <div v-for="key in definedKeys" :key="key" class="env-panel__field">
            <label class="env-panel__field-label" :for="`env-${key}`">
              {{ getLabel(key) }}
              <code class="env-panel__field-key">{{ key }}</code>
            </label>
            <p v-if="store.definitions[key]?.description" class="env-panel__field-desc">
              {{ store.definitions[key].description }}
            </p>
            <input
              :id="`env-${key}`"
              v-model="localDefined[key]"
              type="text"
              class="cms-form-control"
              :placeholder="store.definitions[key]?.default ?? ''"
            />
          </div>
        </div>
      </div>

      <!-- Custom variables (not defined in theme manifest) -->
      <div class="env-panel__section">
        <h3 class="env-panel__section-title">{{ t('admin.data.customVariables', 'Custom variables') }}</h3>
        <p class="env-panel__section-desc">{{ t('admin.data.customVariablesDescription', 'Additional key-value pairs not defined by the theme.') }}</p>

        <div v-if="localCustom.length > 0" class="env-panel__table">
          <div class="env-panel__row env-panel__row--header">
            <span class="env-panel__col env-panel__col--key">{{ t('admin.data.key', 'Key') }}</span>
            <span class="env-panel__col env-panel__col--value">{{ t('admin.data.value', 'Value') }}</span>
            <span class="env-panel__col env-panel__col--action" />
          </div>
          <div v-for="(entry, index) in localCustom" :key="index" class="env-panel__row">
            <div class="env-panel__col env-panel__col--key">
              <input
                v-model="entry.key"
                type="text"
                class="cms-form-control"
                placeholder="VARIABLE_NAME"
                :class="{ 'is-invalid': isDuplicateKey(entry.key, index) || (entry.key.trim() === '' && submitted) }"
              />
            </div>
            <div class="env-panel__col env-panel__col--value">
              <input
                v-model="entry.value"
                type="text"
                class="cms-form-control"
                placeholder="value"
              />
            </div>
            <div class="env-panel__col env-panel__col--action">
              <button class="env-panel__delete" :title="t('admin.data.remove', 'Remove')" @click="removeCustomEntry(index)">
                <span class="material-icons-outlined">close</span>
              </button>
            </div>
          </div>
        </div>

        <div v-else class="env-panel__empty">
          <p>{{ t('admin.data.noCustomVariables', 'No custom variables.') }}</p>
        </div>
      </div>

      <!-- Validation errors -->
      <div v-if="validationError" class="env-panel__validation-error">
        {{ validationError }}
      </div>

      <!-- Actions -->
      <div class="env-panel__actions">
        <button class="cms-btn cms-btn--secondary" @click="addCustomEntry">
          <span class="material-icons-outlined">add</span>
          {{ t('admin.data.addVariable', 'Add variable') }}
        </button>
        <button
          class="cms-btn cms-btn--primary"
          :disabled="store.saving || !!validationError"
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
import { ref, watch, computed } from 'vue'
import { useEnvVariablesStore } from '~/admin/stores/envVariablesStore'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'

interface CustomEntry {
  key: string
  value: string
}

const store = useEnvVariablesStore()
const { t } = useAdminI18n()
const submitted = ref(false)

// Keys defined by the theme manifest
const definedKeys = computed(() => Object.keys(store.definitions))

// Local state for defined variables (keyed by variable name)
const localDefined = ref<Record<string, string>>({})

// Local state for custom (non-defined) variables
const localCustom = ref<CustomEntry[]>([])

// Sync local state when store data changes
watch(
  () => ({ vars: store.variables, defs: store.definitions }),
  ({ vars, defs }) => {
    const defKeys = new Set(Object.keys(defs))

    // Populate defined variable values
    const defined: Record<string, string> = {}
    for (const key of defKeys) {
      defined[key] = vars[key] ?? ''
    }
    localDefined.value = defined

    // Populate custom variable entries
    localCustom.value = Object.entries(vars)
      .filter(([key]) => !defKeys.has(key))
      .map(([key, value]) => ({ key, value }))

    submitted.value = false
  },
  { immediate: true },
)

function getLabel(key: string): string {
  const def = store.definitions[key]
  if (!def?.label) return key
  return getLocalizedLabel(def.label) || key
}

function isDuplicateKey(key: string, currentIndex: number): boolean {
  if (!key.trim()) return false
  // Check against other custom entries
  const isDupInCustom = localCustom.value.some((e, i) => i !== currentIndex && e.key.trim() === key.trim())
  // Check against defined keys
  const isDupInDefined = definedKeys.value.includes(key.trim())
  return isDupInCustom || isDupInDefined
}

const validationError = computed(() => {
  const customKeys = localCustom.value.map(e => e.key.trim()).filter(Boolean)
  const allCustomKeys = [...customKeys]
  const hasDuplicates = allCustomKeys.length !== new Set(allCustomKeys).size
  if (hasDuplicates) return 'Duplicate keys are not allowed.'
  // Check custom keys don't collide with defined keys
  const defKeySet = new Set(definedKeys.value)
  if (allCustomKeys.some(k => defKeySet.has(k))) return 'Custom variable key conflicts with a theme-defined variable.'
  if (submitted.value && localCustom.value.some(e => e.key.trim() === '')) {
    return 'All variable keys must be non-empty.'
  }
  return null
})

function addCustomEntry() {
  localCustom.value = [...localCustom.value, { key: '', value: '' }]
}

function removeCustomEntry(index: number) {
  localCustom.value = localCustom.value.filter((_, i) => i !== index)
}

async function handleSave() {
  submitted.value = true
  if (validationError.value) return

  const vars: Record<string, string> = {}

  // Add defined variable values
  for (const key of definedKeys.value) {
    vars[key] = localDefined.value[key] ?? ''
  }

  // Add custom variable values
  for (const entry of localCustom.value) {
    const key = entry.key.trim()
    if (key) {
      vars[key] = entry.value
    }
  }

  await store.saveVariables(vars)
}
</script>

<style scoped>
.env-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.env-panel__loading {
  padding: 24px;
  text-align: center;
  color: var(--cms-ink-subtle);
}

.env-panel__error,
.env-panel__validation-error {
  padding: 12px;
  background: var(--cms-danger-soft);
  color: var(--cms-danger);
  border-radius: 4px;
  font-size: 13px;
}

.env-panel__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-panel__section-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--cms-ink-muted);
  margin: 0;
  letter-spacing: 0.5px;
}

.env-panel__section-desc {
  font-size: 12px;
  color: var(--cms-ink-subtle);
  margin: 0 0 4px 0;
}

.env-panel__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.env-panel__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.env-panel__field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cms-ink-body);
  display: flex;
  align-items: center;
  gap: 6px;
}

.env-panel__field-key {
  font-size: 11px;
  color: var(--cms-ink-subtle);
  background: var(--cms-surface-subtle);
  padding: 1px 5px;
  border-radius: 3px;
}

.env-panel__field-desc {
  font-size: 12px;
  color: var(--cms-ink-subtle);
  margin: 0;
  line-height: 1.4;
}

.env-panel__empty {
  padding: 16px;
  text-align: center;
  color: var(--cms-ink-subtle);
  font-size: 13px;
}

.env-panel__empty p {
  margin: 0;
}

.env-panel__table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.env-panel__row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.env-panel__row--header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--cms-ink-subtle);
  padding-bottom: 2px;
}

.env-panel__col--key {
  flex: 1 1 40%;
}

.env-panel__col--value {
  flex: 1 1 50%;
}

.env-panel__col--action {
  flex: 0 0 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.env-panel__delete {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--cms-ink-subtle);
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.env-panel__delete:hover {
  color: var(--cms-danger);
  background: var(--cms-danger-soft);
}

.env-panel__delete .material-icons-outlined {
  font-size: 16px;
}

.env-panel__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--cms-line);
}
</style>
