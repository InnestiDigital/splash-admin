<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="a11y-overlay"
      @click.self="close"
    >
      <div
        ref="panelRef"
        class="a11y-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('admin.editor.accessibilityAudit', 'Accessibility audit')"
        tabindex="-1"
      >
        <header class="a11y-head">
          <span class="material-icons-outlined a11y-head-icon" aria-hidden="true">accessibility_new</span>
          <div class="a11y-head-text">
            <h2 class="a11y-title">{{ t('admin.editor.accessibilityAudit', 'Accessibility audit') }}</h2>
            <p class="a11y-sub">{{ t('admin.editor.liveCheck', 'This page · live check') }}</p>
          </div>
          <div class="a11y-counts" aria-live="polite">
            <span v-if="errorCount" class="a11y-chip a11y-chip--error">
              {{ errorCount }} {{ errorCount === 1 ? 'error' : 'errors' }}
            </span>
            <span v-if="warningCount" class="a11y-chip a11y-chip--warn">
              {{ warningCount }} {{ warningCount === 1 ? 'warning' : 'warnings' }}
            </span>
          </div>
          <button type="button" class="a11y-close" :aria-label="t('admin.shared.close', 'Close')" @click="close">
            <span class="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <!-- `tabindex="-1"`: Chromium makes an overflowing scroll container
             focusable on its own, which puts a tab stop inside the trap that is
             neither its first nor its last focusable — Tab then walks out into
             the editor behind the backdrop. -->
        <div v-if="findings.length" class="a11y-list" role="list" tabindex="-1">
          <button
            v-for="f in findings"
            :key="`${f.blockId}-${f.rule}-${f.fieldId}`"
            type="button"
            class="a11y-item"
            :class="`a11y-item--${f.severity}`"
            role="listitem"
            @click="jumpTo(f)"
          >
            <span class="material-icons-outlined a11y-item-icon" aria-hidden="true">
              {{ f.severity === 'error' ? 'error_outline' : 'warning_amber' }}
            </span>
            <span class="a11y-item-body">
              <span class="a11y-item-msg">{{ f.message }}</span>
              <span class="a11y-item-meta">{{ ruleLabel(f.rule) }} · jump to block</span>
            </span>
            <span class="material-icons-outlined a11y-item-go" aria-hidden="true">north_east</span>
          </button>
        </div>

        <div v-else class="a11y-empty">
          <span class="material-icons-outlined a11y-empty-icon" aria-hidden="true">verified</span>
          <p class="a11y-empty-title">{{ t('admin.editor.noAccessibilityIssues', 'No accessibility issues found') }}</p>
          <p class="a11y-empty-sub">{{ t('admin.editor.accessibilityClear', 'Every image has alt text and links read clearly.') }}</p>
        </div>

        <footer class="a11y-foot">
          <span>Checks: image alt text · descriptive link text</span>
          <span><kbd>Esc</kbd> close</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useAccessibilityAudit } from '~/admin/composables/useAccessibilityAudit'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useModalDialog } from '~/admin/composables/useModalDialog'
import { useEditorStore } from '~/admin/stores/editorStore'
import type { A11yFinding, A11yRule } from '~/shared/features/cms/a11y/auditBlocks'

const { isOpen, open, close, toggle, findings, errorCount, warningCount } =
  useAccessibilityAudit()
const { t } = useAdminI18n()
const editorStore = useEditorStore()

const panelRef = ref<HTMLElement | null>(null)

// Escape, the Tab trap, initial + restored focus and the body scroll lock.
// `isOpen` is a `readonly()` module singleton, so mirror it through a computed
// to hand the composable a plain readable ref (as AdminCommandPalette does).
useModalDialog({
  open: computed(() => isOpen.value),
  dialog: panelRef,
  onClose: close,
})

const RULE_LABELS: Record<A11yRule, string> = {
  'image-no-alt-field': 'Missing alt field',
  'image-alt-empty': 'Empty alt text',
  'link-text': 'Unclear link text',
}
function ruleLabel(rule: A11yRule): string {
  return RULE_LABELS[rule]
}

/** Select the offending block so its settings open in the inspector. */
function jumpTo(f: A11yFinding): void {
  editorStore.selectBlock(f.blockId)
  close()
}

function onGlobalKeydown(e: KeyboardEvent): void {
  // Ctrl/Cmd + Shift + A opens the audit (A alone would collide with typing).
  // Escape is deliberately NOT handled here — `useModalDialog` owns it, so the
  // most recently opened dialog is the one that closes.
  if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    e.preventDefault()
    toggle()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<style scoped>
.a11y-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8vh 1rem 1rem;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
}

.a11y-panel {
  width: min(640px, 100%);
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: var(--cms-surface);
  border-radius: 0.9rem;
  box-shadow: 0 1.6rem 4rem rgba(15, 23, 42, 0.28);
  overflow: hidden;
  font-family: 'Open Sans', system-ui, sans-serif;
}

.a11y-head {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid #eef0f4;
}
.a11y-head-icon {
  font-size: 1.6rem;
  color: #0f766e;
}
.a11y-head-text {
  flex: 1;
  min-width: 0;
}
.a11y-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}
.a11y-sub {
  margin: 0;
  font-size: 0.72rem;
  color: var(--cms-ink-subtle);
}
.a11y-counts {
  display: flex;
  gap: 0.4rem;
}
.a11y-chip {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  white-space: nowrap;
}
.a11y-chip--error {
  background: #fee2e2;
  color: #b91c1c;
}
.a11y-chip--warn {
  background: var(--cms-warn-soft);
  color: var(--cms-warn);
}
.a11y-close {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--cms-ink-subtle);
  display: flex;
  padding: 0.2rem;
  border-radius: 0.4rem;
}
.a11y-close:hover {
  background: #f1f5f9;
  color: #475569;
}

.a11y-list {
  overflow-y: auto;
  padding: 0.4rem;
}
.a11y-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  text-align: left;
  padding: 0.7rem 0.75rem;
  border: 0;
  border-radius: 0.55rem;
  background: transparent;
  cursor: pointer;
  border-left: 3px solid transparent;
}
.a11y-item:hover {
  background: #f8fafc;
}
.a11y-item--error {
  border-left-color: #ef4444;
}
.a11y-item--warning {
  border-left-color: #f59e0b;
}
.a11y-item-icon {
  font-size: 1.15rem;
  margin-top: 0.05rem;
}
.a11y-item--error .a11y-item-icon {
  color: #ef4444;
}
.a11y-item--warning .a11y-item-icon {
  color: #f59e0b;
}
.a11y-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.a11y-item-msg {
  font-size: 0.85rem;
  color: #1e293b;
  line-height: 1.35;
}
.a11y-item-meta {
  font-size: 0.7rem;
  color: var(--cms-ink-subtle);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.a11y-item-go {
  font-size: 1rem;
  color: #cbd5e1;
  margin-top: 0.1rem;
}
.a11y-item:hover .a11y-item-go {
  color: #0f766e;
}

.a11y-empty {
  padding: 2.6rem 1.5rem;
  text-align: center;
}
.a11y-empty-icon {
  font-size: 2.4rem;
  color: #10b981;
}
.a11y-empty-title {
  margin: 0.6rem 0 0.2rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.a11y-empty-sub {
  margin: 0;
  font-size: 0.8rem;
  color: var(--cms-ink-subtle);
}

.a11y-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.15rem;
  border-top: 1px solid #eef0f4;
  font-size: 0.72rem;
  color: var(--cms-ink-subtle);
}
.a11y-foot kbd {
  font-family: inherit;
  background: #f1f5f9;
  border-radius: 0.3rem;
  padding: 0.05rem 0.35rem;
  font-size: 0.68rem;
  color: #475569;
}
</style>
