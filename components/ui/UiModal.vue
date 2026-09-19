<template>
  <Teleport to="body">
    <Transition name="ui-dialog">
      <div
        v-if="open"
        class="ui-modal__overlay"
        @pointerdown.self="onOverlayPointerDown"
      >
        <div
          ref="dialogEl"
          class="ui-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="$slots.description ? descriptionId : undefined"
          :style="{ maxWidth: width }"
        >
          <header class="ui-modal__header">
            <h2 :id="titleId">{{ title }}</h2>
            <button
              type="button"
              class="ui-modal__close"
              :aria-label="closeLabel"
              :disabled="!dismissible"
              @click="requestClose"
            >
              <span class="material-icons-outlined" aria-hidden="true">close</span>
            </button>
          </header>

          <div class="ui-modal__body">
            <p v-if="$slots.description" :id="descriptionId" class="ui-modal__description">
              <slot name="description" />
            </p>
            <slot />
          </div>

          <footer v-if="$slots.footer" class="ui-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import { useModalDialog } from '~/admin/composables/useModalDialog'

/**
 * The admin dialog. Composes `useModalDialog` (Escape, focus trap, initial
 * focus, focus restoration, scroll lock) with the shared dialog chrome, so a
 * feature never re-derives either half.
 *
 * Replaces six independent implementations, two of which defined a global-ish
 * `.modal-overlay` class (I8 in docs/design/admin-architecture-lock.md).
 *
 * Closing is always the parent's decision — this emits `close` and never hides
 * itself, so a dialog can refuse to close while a save is in flight.
 */
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** Max dialog width. Defaults to the standard confirmation size. */
  width?: string
  /** Whether a pointerdown on the backdrop requests a close. */
  dismissible?: boolean
  closeLabel?: string
}>(), {
  width: '48rem',
  dismissible: true,
  closeLabel: 'Close',
})

const emit = defineEmits<{ close: [] }>()

const dialogEl = ref<HTMLElement | null>(null)
const uid = useId()
const titleId = computed(() => `ui-modal-title-${uid}`)
const descriptionId = computed(() => `ui-modal-description-${uid}`)

useModalDialog({
  open: toRef(props, 'open'),
  dialog: dialogEl,
  onClose: requestClose,
  initialFocus: () => dialogEl.value?.querySelector<HTMLElement>('.ui-modal__footer button:not(:disabled)'),
})

function requestClose() {
  if (props.dismissible) emit('close')
}

const onOverlayPointerDown = requestClose
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.ui-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--cms-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--cms-sp-5);
  background: rgba(18, 27, 21, 0.52);
  backdrop-filter: blur(3px);
}

.ui-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: min(90vh, 72rem);
  overflow: hidden;
  background: var(--cms-surface);
  border-radius: var(--cms-radius-dialog);
  box-shadow: var(--cms-elev-3);
  transform-origin: center;
  transition: opacity 160ms var(--cms-ease-out), transform 220ms var(--cms-ease-out);
}

.ui-modal__overlay {
  transition: opacity 180ms var(--cms-ease-out);
}

.ui-dialog-enter-from,
.ui-dialog-leave-to { opacity: 0; }

.ui-dialog-enter-from .ui-modal,
.ui-dialog-leave-to .ui-modal {
  opacity: 0;
  transform: scale(0.97);
}

.ui-dialog-leave-active,
.ui-dialog-leave-active .ui-modal { transition-duration: 140ms; }

.ui-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-sp-4);
  padding: var(--cms-sp-5) var(--cms-sp-5) var(--cms-sp-4);
  border-bottom: 1px solid var(--cms-line);

  h2 {
    margin: 0;
    font-size: var(--cms-fs-h3);
    font-weight: 700;
    color: var(--cms-ink);
  }
}

.ui-modal__close {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--cms-density-xs);
  height: var(--cms-density-xs);
  color: var(--cms-ink-muted);
  background: none;
  border: 0;
  border-radius: var(--cms-radius-control);
  cursor: pointer;
  transition: background var(--cms-motion-fast) var(--cms-ease-out);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: var(--cms-surface-subtle);
      color: var(--cms-ink);
    }
  }
}

.ui-modal__close:disabled { visibility: hidden; cursor: default; }

@media (prefers-reduced-motion: reduce) {
  .ui-modal { transform: none; transition: opacity 160ms ease; }
}

.ui-modal__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--cms-sp-5);
  font-size: var(--cms-fs-body);
  color: var(--cms-ink-body);
}

.ui-modal__description {
  margin: 0 0 var(--cms-sp-4);
  color: var(--cms-ink-muted);

  &:only-child {
    margin-bottom: 0;
  }
}

.ui-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--cms-sp-2);
  padding: var(--cms-sp-4) var(--cms-sp-5);
  border-top: 1px solid var(--cms-line);
}
</style>
