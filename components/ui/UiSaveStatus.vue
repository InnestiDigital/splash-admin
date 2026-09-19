<template>
  <span v-if="status === 'saving'" class="ui-save-status ui-save-status--saving">{{ t('admin.shared.saving', 'Saving…') }}</span>
  <span v-else-if="status === 'saved'" class="ui-save-status ui-save-status--saved">{{ t('admin.shared.saved', 'Saved') }}</span>
  <button
    v-else-if="status === 'error'"
    type="button"
    class="ui-save-status ui-save-status--error"
    @click="emit('retry')"
  >{{ t('admin.shared.saveFailed', 'Save failed — Retry') }}</button>
  <span v-else-if="dirty" class="ui-save-status ui-save-status--dirty">{{ t('admin.shared.unsaved', 'Unsaved') }}</span>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
/**
 * Per-surface autosave status.
 *
 * This answers "is the thing I am editing saved?", which is a different
 * question from the editor topbar's `EditorSaveStatus` ("is anything in this
 * session unsaved?"). Both are legitimate; what was wrong was three copies of
 * this markup in `SettingsPanel`, each with its own wording (I7).
 *
 * The error state is a real button, not text, so retry is keyboard reachable.
 */
defineProps<{
  status: 'idle' | 'saving' | 'saved' | 'error'
  /** Shown as "Unsaved" when the surface is dirty and not otherwise busy. */
  dirty?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()
const { t } = useAdminI18n()
</script>

<style lang="scss" scoped>
.ui-save-status {
  // Right-aligns within the panel header, as the three copies of this used to.
  margin-left: auto;
  // The header is a flex row of title + type chip + this. Without holding its
  // own size, a long block title pushed this badge past the panel edge.
  flex: none;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: var(--cms-radius-pill);
  font-size: var(--cms-fs-overline);
  line-height: inherit;
}

.ui-save-status--dirty {
  color: var(--cms-warn);
  background: var(--cms-warn-soft);
}

.ui-save-status--saving {
  color: var(--cms-accent);
  animation: ui-save-status-pulse 1s ease-in-out infinite;
}

.ui-save-status--saved {
  color: var(--cms-accent);
}

.ui-save-status--error {
  appearance: none;
  border: 0;
  background: transparent;
  font-family: inherit;
  color: var(--cms-danger);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid var(--cms-accent);
    outline-offset: 2px;
  }
}

@keyframes ui-save-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

// The pulse is decorative; a persistent "Saving…" is enough on its own.
@media (prefers-reduced-motion: reduce) {
  .ui-save-status--saving {
    animation: none;
  }
}
</style>
