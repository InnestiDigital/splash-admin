<template>
  <Teleport to="body">
    <Transition name="ui-drawer">
      <div v-if="open" class="ui-drawer__overlay" @pointerdown.self="requestClose">
        <aside
          ref="dialogEl"
          class="ui-drawer"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
        >
          <header class="ui-drawer__header">
            <div>
              <span v-if="eyebrow" class="ui-drawer__eyebrow">{{ eyebrow }}</span>
              <h2 :id="titleId">{{ title }}</h2>
              <p v-if="description" :id="descriptionId">{{ description }}</p>
            </div>
            <button type="button" :aria-label="t('admin.shared.close', 'Close')" :disabled="!dismissible" @click="requestClose">
              <span class="material-icons-outlined" aria-hidden="true">close</span>
            </button>
          </header>
          <div class="ui-drawer__body"><slot /></div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import { useModalDialog } from '~/admin/composables/useModalDialog'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  eyebrow?: string
  dismissible?: boolean
}>(), { dismissible: true })

const emit = defineEmits<{ close: [] }>()
const { t } = useAdminI18n()
const dialogEl = ref<HTMLElement | null>(null)
const uid = useId()
const titleId = computed(() => `ui-drawer-title-${uid}`)
const descriptionId = computed(() => `ui-drawer-description-${uid}`)

function requestClose() {
  if (props.dismissible) emit('close')
}

useModalDialog({
  open: toRef(props, 'open'),
  dialog: dialogEl,
  onClose: requestClose,
  initialFocus: () => dialogEl.value?.querySelector<HTMLElement>('.ui-drawer__body input:not([type="hidden"]):not(:disabled), .ui-drawer__body select:not(:disabled), .ui-drawer__body textarea:not(:disabled)'),
})
</script>

<style scoped>
.ui-drawer__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--cms-z-modal);
  display: flex;
  justify-content: flex-end;
  background: rgba(18, 27, 21, 0.42);
  backdrop-filter: blur(2px);
  transition: opacity 180ms var(--cms-ease-out);
}

.ui-drawer {
  display: flex;
  width: min(52rem, 100vw);
  height: 100%;
  flex-direction: column;
  color: var(--cms-ink-body);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-3);
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 180ms var(--cms-ease-out);
}

.ui-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cms-sp-4);
  padding: var(--cms-sp-5);
  border-bottom: 1px solid var(--cms-line);
}

.ui-drawer__header h2 { margin: 0; color: var(--cms-ink); font-size: var(--cms-fs-h2); }
.ui-drawer__header p { margin: 0.5rem 0 0; color: var(--cms-ink-muted); font-size: var(--cms-fs-sm); }
.ui-drawer__eyebrow { display: block; margin-bottom: 0.4rem; color: var(--cms-accent); font-size: var(--cms-fs-overline); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.ui-drawer__header button { display:grid; width:3.6rem; height:3.6rem; padding:0; place-items:center; color:var(--cms-ink-muted); border:0; border-radius:var(--cms-radius-control); background:transparent; cursor:pointer; }
.ui-drawer__header button:hover { color:var(--cms-ink); background:var(--cms-surface-subtle); }
.ui-drawer__header button:disabled { visibility:hidden; cursor:default; }
.ui-drawer__body { flex: 1; min-height: 0; overflow: auto; padding: var(--cms-sp-5); }

.ui-drawer-enter-from,
.ui-drawer-leave-to { opacity: 0; }
.ui-drawer-enter-from .ui-drawer,
.ui-drawer-leave-to .ui-drawer { opacity: 0; transform: translateX(100%); }
.ui-drawer-leave-active,
.ui-drawer-leave-active .ui-drawer { transition-duration: 180ms; }

@media (prefers-reduced-motion: reduce) {
  .ui-drawer { transform: none; transition: opacity 160ms ease; }
}
</style>
