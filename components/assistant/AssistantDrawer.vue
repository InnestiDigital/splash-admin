<template>
  <aside
    v-if="store.enabled && store.open"
    class="assistant-drawer"
    role="complementary"
    :aria-label="title"
  >
    <header class="assistant-drawer__header">
      <h2 class="assistant-drawer__title">{{ title }}</h2>
      <button type="button" class="assistant-drawer__close" :aria-label="closeLabel" @click="store.toggle()">
        <span class="material-icons-outlined" aria-hidden="true">close</span>
      </button>
    </header>
    <p v-if="notice" class="assistant-drawer__notice" role="status">{{ notice }}</p>
    <p v-if="prefillNotice" class="assistant-drawer__notice" role="status">{{ prefillNotice }}</p>
    <p v-if="prefillReport" class="assistant-drawer__notice" role="status">{{ prefillReport }}</p>
    <p v-if="editorOpsNotice" class="assistant-drawer__notice" role="status">{{ editorOpsNotice }}</p>
    <div v-if="editorOpsLines.length" class="assistant-drawer__report" role="status">
      <ul class="assistant-drawer__report-list">
        <li
          v-for="(line, i) in editorOpsLines"
          :key="i"
          :class="['assistant-drawer__report-line', `assistant-drawer__report-line--${line.kind}`]"
        >
          <template v-if="line.kind === 'applied'">{{ opsAppliedLabel }}: {{ line.text }}</template>
          <template v-else-if="line.kind === 'failed'">{{ opsFailedLabel }}: {{ line.text }}</template>
          <template v-else>{{ line.text }}</template>
        </li>
      </ul>
    </div>
    <AssistantMessageList
      :messages="store.messages"
      :loading="store.loading"
      :error="store.error"
      :working-label="workingLabel"
    />
    <form class="assistant-drawer__composer" @submit.prevent="submit">
      <!-- Deliberately NOT disabled while a turn streams: a disabled input
           swallows keystrokes, so everything typed during a reply vanished
           with zero feedback (found live). Composing stays open; only SENDING
           is gated — submit() keeps the draft when a turn is in flight. -->
      <input
        v-model="draft"
        class="assistant-drawer__input"
        type="text"
        :placeholder="placeholder"
      >
      <button type="submit" class="assistant-drawer__send" :disabled="store.loading || !draft.trim()">
        {{ sendLabel }}
      </button>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AssistantMessageList from '~/admin/components/assistant/AssistantMessageList.vue'
import { useAssistantStore } from '~/admin/stores/assistantStore'
import { useAssistantNavigation } from '~/admin/composables/useAssistantNavigation'
import { useAssistantPrefill } from '~/admin/composables/useAssistantPrefill'
import { useAssistantPrefillStore } from '~/admin/stores/assistantPrefillStore'
import { useAssistantEditorOps } from '~/admin/composables/useAssistantEditorOps'
import { useAssistantEditorContext } from '~/admin/composables/useAssistantEditorContext'
import { useAssistantEditorOpsStore } from '~/admin/stores/assistantEditorOpsStore'
import { formatOpsReport } from '~/admin/components/assistant/opsReportLines'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

/**
 * Non-modal deliberately: this is a persistent right-side panel, not a
 * dialog — no overlay, no `useModalDialog`, no focus trap, no Escape
 * handler. `--cms-z-drawer` sits below `--cms-z-modal` so `UiConfirmHost`
 * dialogs still stack above the drawer.
 */
const { t } = useAdminI18n()
const title = t('admin.assistant.title', 'Assistant')
const closeLabel = t('admin.assistant.close', 'Close assistant')
const workingLabel = t('admin.assistant.working', 'Thinking…')
const placeholder = t('admin.assistant.placeholder', 'Ask about your site…')
const sendLabel = t('admin.assistant.send', 'Send')
const opsAppliedLabel = t('admin.assistant.opsApplied', 'Applied')
const opsFailedLabel = t('admin.assistant.opsFailed', 'Failed')

const store = useAssistantStore()
const { notice } = useAssistantNavigation()
const { notice: prefillNotice } = useAssistantPrefill()
const prefillStore = useAssistantPrefillStore()
/** Dropped-only notice (spec §4.3): a fully applied prefill shows nothing. */
const prefillReport = computed(() => {
  const r = prefillStore.lastReport
  return r && r.dropped.length > 0 ? `Not applied: ${r.dropped.join(', ')}` : null
})

// Editor ops: the digest provider (what the model reads) and the executor
// (what it writes through). Both live here rather than on the editor page —
// the drawer is the assistant's only mount point, and the editor-mounted gate
// inside each of them is what keeps the shell layout honest.
useAssistantEditorContext()
const { notice: editorOpsNotice } = useAssistantEditorOps()
const editorOpsStore = useAssistantEditorOpsStore()
/**
 * The full report — applied, failed and ranked destruction/undo warnings — not
 * failures only. An operator watching the drawer is the report's only account
 * of what a batch destroyed or made unundoable [R10]; burying that behind "the
 * model will narrate it" is exactly the failure mode this surface exists to
 * prevent. `formatOpsReport` puts warnings ahead of applied/failed lines so
 * that ranking (destructive notice first) survives into the render order.
 */
const editorOpsLines = computed(() => formatOpsReport(editorOpsStore.lastReport))
const draft = ref('')

async function submit() {
  // The AG-UI client runs one turn at a time; sending mid-stream would race
  // the live run. Keep the draft in the box instead of dropping it — the
  // operator presses Enter again when the turn ends.
  if (store.loading) return
  const text = draft.value
  draft.value = ''
  const sent = await store.send(text)
  if (!sent) draft.value = text
}
</script>

<style scoped>
.assistant-drawer {
  position: fixed;
  inset-block: 0;
  inset-inline-end: 0;
  /* px, not rem: this is a fixed-size overlay that now mounts under two html
     roots — `cms-admin` runs a 62.5% rem base, `cms-editor` the browser's 16px
     one, so a rem width renders 1.6x larger in the editor. */
  inline-size: min(400px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-3);
  z-index: var(--cms-z-drawer);
  border-inline-start: var(--cms-border-width-hairline) solid var(--cms-border);
}
.assistant-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-4);
  padding: var(--cms-sp-4) var(--cms-sp-5);
  border-block-end: var(--cms-border-width-hairline) solid var(--cms-border);
}
.assistant-drawer__title {
  margin: 0;
  color: var(--cms-ink);
  font-size: var(--cms-fs-h3);
}
.assistant-drawer__close {
  display: grid;
  place-items: center;
  padding: 0;
  inline-size: var(--cms-density-sm);
  block-size: var(--cms-density-sm);
  color: var(--cms-ink-muted);
  border: 0;
  border-radius: var(--cms-radius-control);
  background: transparent;
  cursor: pointer;
}
.assistant-drawer__close:hover {
  color: var(--cms-ink);
  background: var(--cms-surface-subtle);
}
.assistant-drawer__notice {
  margin: 0;
  padding: var(--cms-sp-2) var(--cms-sp-5);
  color: var(--cms-warn);
  background: var(--cms-warn-soft);
  font-size: var(--cms-fs-sm);
}
.assistant-drawer__report {
  margin: 0;
  padding: var(--cms-sp-2) var(--cms-sp-5);
  color: var(--cms-ink-muted);
  background: var(--cms-surface-subtle);
  font-size: var(--cms-fs-sm);
}
.assistant-drawer__report-list {
  margin: 0;
  padding-inline-start: var(--cms-sp-5);
}
.assistant-drawer__report-line--warning {
  color: var(--cms-warn);
}
.assistant-drawer__composer {
  display: flex;
  gap: var(--cms-sp-2);
  padding: var(--cms-sp-3) var(--cms-sp-5);
  border-block-start: var(--cms-border-width-hairline) solid var(--cms-border);
}
.assistant-drawer__input {
  flex: 1;
  padding: var(--cms-sp-2) var(--cms-sp-3);
  color: var(--cms-ink-body);
  border: var(--cms-border-width-hairline) solid var(--cms-border);
  border-radius: var(--cms-radius-control);
  background: var(--cms-surface);
  font-size: var(--cms-fs-sm);
}
.assistant-drawer__input:disabled {
  color: var(--cms-ink-subtle);
  background: var(--cms-surface-subtle);
}
.assistant-drawer__send {
  padding: var(--cms-sp-2) var(--cms-sp-4);
  color: var(--cms-ink-inverse);
  border: 0;
  border-radius: var(--cms-radius-control);
  background: var(--cms-accent);
  font-size: var(--cms-fs-sm);
  cursor: pointer;
}
.assistant-drawer__send:disabled {
  background: var(--cms-accent-soft);
  cursor: default;
}
</style>
