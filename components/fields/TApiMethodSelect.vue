<template>
  <BaseField :field="field" type="api-method" :disabled="disabled">
    <select
      v-if="!isMulti"
      class="t-field__select"
      :value="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">-- Select an API method --</option>
      <option v-for="method in methods" :key="method.key" :value="method.key">
        {{ method.label || method.key }}
      </option>
    </select>

    <!-- Multi-select mode for sequence/parallel methods -->
    <div v-else class="t-api-method__multi">
      <label
        v-for="method in methods"
        :key="method.key"
        class="t-api-method__checkbox"
      >
        <input
          type="checkbox"
          :checked="selectedKeys.includes(method.key)"
          :disabled="disabled"
          @change="toggleMethod(method.key)"
        />
        <span>{{ method.label || method.key }}</span>
        <span class="t-api-method__http">{{ method.httpMethod }}</span>
        <span v-for="tag in (method.tags || [])" :key="tag" class="t-api-method__tag">{{ tag }}</span>
      </label>
    </div>

    <p v-if="!isMulti && selectedMethod" class="t-api-method__details">
      <span v-if="selectedMethod.httpMethod" class="t-api-method__http">{{ selectedMethod.httpMethod }}</span>
      <span v-if="selectedMethod.endpoint" class="t-api-method__endpoint">{{ selectedMethod.endpoint }}</span>
      <span v-for="tag in (selectedMethod.tags || [])" :key="tag" class="t-api-method__tag">{{ tag }}</span>
    </p>
  </BaseField>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import BaseField from './BaseField.vue'
import { useApiConfigStore } from '~/admin/stores/apiConfigStore'

interface ApiMethod {
  key: string
  label?: string
  httpMethod?: string
  endpoint?: string
  tags?: string[]
}

const props = defineProps<{
  field: Record<string, any>
  modelValue?: string | string[] | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]]
}>()

const store = useApiConfigStore()

// Load API config if not already loaded
onMounted(async () => {
  if (store.requests.length === 0 && !store.loading) {
    await store.fetchApiConfig()
  }
})

// Whether this field is multi-select (for sequence/parallel methods)
const isMulti = computed(() => {
  return props.field.multi === true || props.field.type === 'multiselect'
})

// Build methods list from the api config store, filtered by allowedTags if set
const methods = computed<ApiMethod[]>(() => {
  const allowedTags: string[] | undefined = props.field.allowedTags
  const allMethods = store.requests.map(r => ({
    key: r.name,
    label: r.name,
    httpMethod: r.method,
    endpoint: r.endpoint,
    tags: (r.body as Record<string, any>)?.tags as string[] | undefined,
  }))

  // If allowedTags is not set, show all methods (backward compatible)
  if (!allowedTags || allowedTags.length === 0) return allMethods

  // Filter: only show methods whose tags intersect with allowedTags
  return allMethods.filter(m => {
    if (!m.tags || m.tags.length === 0) return false
    return m.tags.some(t => allowedTags.includes(t))
  })
})

const selectedMethod = computed(() => {
  if (!props.modelValue || typeof props.modelValue !== 'string') return null
  return methods.value.find(m => m.key === props.modelValue) || null
})

// Multi-select helpers
const selectedKeys = computed<string[]>(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue
  if (typeof props.modelValue === 'string' && props.modelValue) return [props.modelValue]
  return []
})

function toggleMethod(key: string) {
  const current = [...selectedKeys.value]
  const index = current.indexOf(key)
  if (index === -1) {
    current.push(key)
  } else {
    current.splice(index, 1)
  }
  emit('update:modelValue', current)
}
</script>

<style scoped>
.t-api-method__details {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cms-sp-2, 8px);
  margin: var(--cms-sp-2, 8px) 0 0;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  font-size: var(--cms-fs-caption, 12px);
  line-height: 1.45;
}

.t-api-method__http {
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.t-api-method__endpoint {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--cms-ink-body, var(--cms-ink-body));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.t-api-method__multi {
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-2, 8px);
}

.t-api-method__checkbox {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cms-sp-2, 8px);
  min-height: var(--cms-density-md, 40px);
  margin: 0;
  padding: var(--cms-sp-2, 8px) 10px;
  border: 1px solid transparent;
  border-radius: var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
  font-size: var(--cms-fs-sm, 13px);
  line-height: 1.35;
  cursor: pointer;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .t-api-method__checkbox:not(:has(input:disabled)):hover {
    border-color: var(--cms-line, var(--cms-line));
    background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  }
}

.t-api-method__checkbox input {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--cms-accent, var(--cms-accent));
  cursor: pointer;
}

.t-api-method__checkbox input:focus-visible,
.t-field__select:focus-visible {
  outline: none;
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-api-method__checkbox:has(input:disabled) {
  opacity: 0.62;
  cursor: default;
}

.t-api-method__checkbox input:disabled {
  cursor: default;
}

.t-api-method__tag {
  display: inline-block;
  padding: 2px 6px;
  border-radius: var(--cms-radius-pill, 999px);
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-soft, var(--cms-accent-soft));
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  text-transform: lowercase;
}
</style>
