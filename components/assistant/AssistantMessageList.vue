<template>
  <ol class="assistant-messages" aria-live="polite">
    <li
      v-for="message in messages"
      :key="message.id"
      class="assistant-messages__item"
      :data-role="message.role"
    >
      {{ message.content }}
    </li>
    <li v-if="loading" class="assistant-messages__item assistant-messages__item--working" data-role="assistant">
      {{ workingLabel }}
    </li>
    <li v-if="error" class="assistant-messages__item assistant-messages__item--error" role="alert">
      {{ error }}
    </li>
  </ol>
</template>

<script setup lang="ts">
import type { AgentMessage } from '~/admin/lib/protocol/types/agent'

defineProps<{
  messages: readonly AgentMessage[]
  loading: boolean
  error: string | null
  workingLabel: string
}>()
</script>

<style scoped>
.assistant-messages {
  list-style: none;
  margin: 0;
  padding: var(--cms-sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--cms-sp-2);
  overflow-y: auto;
  flex: 1;
}
.assistant-messages__item {
  padding: var(--cms-sp-2) var(--cms-sp-3);
  border-radius: var(--cms-radius-control);
  background: var(--cms-surface-subtle);
  font-size: var(--cms-fs-sm);
  color: var(--cms-ink-body);
  white-space: pre-wrap;
}
.assistant-messages__item[data-role='user'] {
  align-self: flex-end;
  background: var(--cms-accent-soft);
}
.assistant-messages__item--working {
  color: var(--cms-ink-muted);
}
.assistant-messages__item--error {
  color: var(--cms-danger);
  background: var(--cms-danger-soft);
}
</style>
