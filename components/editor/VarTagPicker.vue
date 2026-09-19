<template>
  <div v-if="hasVars" class="var-tag-picker">
    <span class="var-tag-picker__label">Variables:</span>
    <button
      v-for="key in envKeys"
      :key="`env-${key}`"
      class="var-tag var-tag--env"
      type="button"
      @mousedown.prevent
      @click="$emit('insert', `{{${key}}}`)"
    >{{ key }}</button>
    <button
      v-for="key in headerKeys"
      :key="`hdr-${key}`"
      class="var-tag var-tag--header"
      type="button"
      @mousedown.prevent
      @click="$emit('insert', `{{${key}}}`)"
    >{{ key }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  envKeys: string[]
  headerKeys: string[]
}>()

defineEmits<{
  insert: [tag: string]
}>()

const hasVars = computed(() => props.envKeys.length > 0 || props.headerKeys.length > 0)
</script>

<style scoped>
.var-tag-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.var-tag-picker__label {
  font-size: 11px;
  color: var(--cms-ink-subtle);
  font-weight: 500;
}

.var-tag {
  padding: 2px 8px;
  border-radius: 12px;
  border: none;
  font-size: 11px;
  font-family: monospace;
  cursor: pointer;
  line-height: 1.6;
  transition: opacity 0.15s;
}

.var-tag:hover {
  opacity: 0.75;
}

.var-tag--env {
  background: #e6f4ea;
  color: var(--cms-accent);
}

.var-tag--header {
  background: #e3f0ff;
  color: #0052cc;
}
</style>
