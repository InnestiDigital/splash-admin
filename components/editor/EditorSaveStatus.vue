<template>
  <div
    class="editor-save-status"
    :class="`editor-save-status--${changes.status}`"
    :data-status="changes.status"
    :title="statusTitle"
  >
    <span
      class="editor-save-status__message"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span class="material-icons-outlined editor-save-status__icon" aria-hidden="true">
        {{ statusIcon }}
      </span>
      <span class="editor-save-status__label">{{ statusLabel }}</span>
    </span>
    <button
      v-if="changes.status === 'error'"
      type="button"
      class="editor-save-status__action"
      :disabled="retrying"
      @click="retry"
    >
      {{ retrying ? 'Retrying…' : 'Retry' }}
    </button>
    <button
      v-else-if="changes.status === 'blocked'"
      type="button"
      class="editor-save-status__action"
      @click="reviewBlocked"
    >
      Review
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorChangeStore } from '~/admin/stores/editorChangeStore'

const changes = useEditorChangeStore()
const retrying = ref(false)

const statusIcon = computed(() => {
  switch (changes.status) {
    case 'error': return 'sync_problem'
    case 'blocked': return 'error_outline'
    case 'saving': return 'cloud_upload'
    case 'dirty': return 'edit_note'
    default: return 'cloud_done'
  }
})

const statusLabel = computed(() => {
  if (changes.status === 'error') {
    return changes.errorJobs.length === 1 ? 'Save failed' : `${changes.errorJobs.length} saves failed`
  }
  if (changes.status === 'blocked') return 'Saving blocked'
  return changes.statusLabel
})

const statusTitle = computed(() => {
  if (changes.status === 'blocked') {
    return changes.blockedJobs[0]?.blockedReason ?? changes.statusLabel
  }
  if (changes.status === 'error') {
    return changes.errorJobs[0]?.error ?? changes.statusLabel
  }
  return changes.statusLabel
})

async function retry(): Promise<void> {
  if (retrying.value) return
  retrying.value = true
  try {
    await changes.retryFailed()
  } finally {
    retrying.value = false
  }
}

function reviewBlocked(): void {
  void changes.flushAll(true)
}
</script>

<style scoped>
.editor-save-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 148px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--cms-line);
  border-radius: var(--cms-radius-pill);
  background: var(--cms-surface-subtle);
  color: var(--cms-ink-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
}

.editor-save-status--saved {
  border-color: var(--cms-ok);
  background: var(--cms-ok-soft);
  color: var(--cms-ok);
}

.editor-save-status--dirty,
.editor-save-status--blocked {
  border-color: var(--cms-warn);
  background: var(--cms-warn-soft);
  color: var(--cms-warn);
}

.editor-save-status--error {
  border-color: var(--cms-danger);
  background: var(--cms-danger-soft);
  color: var(--cms-danger);
}

.editor-save-status__icon {
  flex: 0 0 auto;
  font-size: 16px;
}

.editor-save-status__message {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.editor-save-status__action {
  margin: 0 -3px 0 2px;
  padding: 2px 4px 2px 7px;
  border: 0;
  border-left: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.editor-save-status__action:disabled {
  cursor: wait;
  opacity: 0.65;
}

.editor-save-status__action:focus-visible {
  border-radius: 3px;
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .editor-save-status {
    min-width: 28px;
    padding: 0 7px;
  }

  .editor-save-status__label {
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
}
</style>
