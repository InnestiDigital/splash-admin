<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  tabs: Array<{ id: string; label: string; hidden?: boolean }>
}>()

const emit = defineEmits<{
  'update:modelValue': [tab: string]
}>()

const visibleTabs = computed(() => props.tabs.filter(t => !t.hidden))
</script>

<template>
  <div class="editor-tabs">
    <button
      v-for="tab in visibleTabs"
      :key="tab.id"
      class="editor-tabs__tab"
      :class="{ 'editor-tabs__tab--active': modelValue === tab.id }"
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.editor-tabs {
  display: flex;
  gap: 4px;
  padding: 0 0 0 0;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--cms-line);
}
.editor-tabs__tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--cms-ink-subtle);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.editor-tabs__tab:hover {
  color: var(--cms-ink-body);
}
.editor-tabs__tab--active {
  color: var(--cms-accent);
  border-bottom-color: var(--cms-accent);
}
</style>
