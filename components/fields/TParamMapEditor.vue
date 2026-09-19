<template>
  <div class="t-param-map">
    <div v-if="rows.length" class="t-param-map__header">
      <span class="t-param-map__col-label">Parameter name</span>
      <span class="t-param-map__col-label">Maps to</span>
      <span class="t-param-map__col-action"></span>
    </div>

    <div v-for="(row, index) in rows" :key="index" class="t-param-map__row">
      <input
        v-model="row.apiParam"
        class="t-param-map__input"
        placeholder="API param name"
        @input="emitUpdate"
      />
      <input
        v-model="row.componentVar"
        class="t-param-map__input"
        :placeholder="row.apiParam || 'source variable'"
        @input="emitUpdate"
      />
      <button class="t-param-map__remove" title="Remove" @click="removeRow(index)">
        &times;
      </button>
    </div>

    <button class="t-param-map__add" @click="addRow">+ Add parameter</button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface ParamRow {
  apiParam: string
  componentVar: string
}

const props = defineProps<{
  modelValue: string[] | Record<string, string> | null | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>]
}>()

const rows = ref<ParamRow[]>([])

// Detect format and populate rows
function initFromValue(value: string[] | Record<string, string> | null | undefined) {
  if (!value) {
    rows.value = []
    return
  }

  if (Array.isArray(value)) {
    // Legacy string[] format — treat as identical mapping (password → password)
    rows.value = value.map(key => ({ apiParam: key, componentVar: key }))
  } else if (typeof value === 'object') {
    // Record<string, string> format — { apiParam: componentVar }
    rows.value = Object.entries(value).map(([apiParam, componentVar]) => ({
      apiParam,
      componentVar,
    }))
  }
}

initFromValue(props.modelValue)

watch(() => props.modelValue, (newVal) => {
  initFromValue(newVal)
}, { deep: true })

function addRow() {
  rows.value.push({ apiParam: '', componentVar: '' })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  emitUpdate()
}

function emitUpdate() {
  const result: Record<string, string> = {}
  for (const row of rows.value) {
    const key = row.apiParam.trim()
    if (!key) continue
    // If "maps to" is blank, default to same as param name
    result[key] = row.componentVar.trim() || key
  }
  emit('update:modelValue', result)
}
</script>

<style scoped>
.t-param-map {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.t-param-map__header {
  display: grid;
  grid-template-columns: 1fr 1fr 28px;
  gap: 8px;
  padding: 0 0 4px;
}

.t-param-map__col-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--cms-ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.t-param-map__row {
  display: grid;
  grid-template-columns: 1fr 1fr 28px;
  gap: 8px;
  align-items: center;
}

.t-param-map__input {
  padding: 6px 8px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 13px;
  font-family: monospace;
  transition: border-color 0.15s;
}

.t-param-map__input:focus {
  outline: none;
  border-color: var(--cms-accent);
}

.t-param-map__remove {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--cms-ink-subtle);
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
}

.t-param-map__remove:hover {
  background: #fee;
  color: #c00;
}

.t-param-map__add {
  align-self: flex-start;
  padding: 4px 12px;
  border: 1px dashed var(--cms-line-strong);
  border-radius: 4px;
  background: none;
  color: var(--cms-accent);
  font-size: 12px;
  cursor: pointer;
  margin-top: 4px;
}

.t-param-map__add:hover {
  background: #f0f6ff;
  border-color: var(--cms-accent);
}
</style>
