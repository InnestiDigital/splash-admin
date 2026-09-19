<script setup lang="ts">
import type { LayoutChromeConfig, LayoutChromeElement } from '~/shared/types/layout'
import ChromeElementEditor from './ChromeElementEditor.vue'

defineProps<{ chrome: LayoutChromeConfig }>()
const emit = defineEmits<{
  add: [type: LayoutChromeElement['type']]
  remove: [id: string]
  update: [id: string, patch: Partial<LayoutChromeElement>]
}>()
</script>

<template>
  <section class="cms-card chrome-panel">
    <div class="cms-card__header chrome-panel__header">
      <h3 class="cms-card__title">Chrome elements</h3>
      <div class="chrome-panel__actions">
        <button
          data-action="add-line"
          type="button"
          class="cms-btn cms-btn--secondary cms-btn--sm"
          @click="emit('add', 'line')"
        >
          + Line
        </button>
        <button
          data-action="add-shape"
          type="button"
          class="cms-btn cms-btn--secondary cms-btn--sm"
          @click="emit('add', 'shape')"
        >
          + Shape
        </button>
        <button
          data-action="add-image"
          type="button"
          class="cms-btn cms-btn--secondary cms-btn--sm"
          @click="emit('add', 'image')"
        >
          + Image
        </button>
        <button
          data-action="add-text"
          type="button"
          class="cms-btn cms-btn--secondary cms-btn--sm"
          @click="emit('add', 'text')"
        >
          + Text
        </button>
      </div>
    </div>
    <div class="cms-card__body">
      <ul v-if="chrome.elements.length > 0" class="chrome-panel__list">
        <li
          v-for="elem in chrome.elements"
          :key="elem.id"
          data-chrome-element-row
          class="chrome-panel__row"
        >
          <ChromeElementEditor
            :element="elem"
            @update:element="(patch: any) => emit('update', elem.id, patch)"
          />
          <div class="chrome-panel__row-actions">
            <button
              data-action="remove"
              :data-id="elem.id"
              type="button"
              class="cms-btn cms-btn--danger-quiet cms-btn--sm"
              @click="emit('remove', elem.id)"
            >
              Remove
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="chrome-panel__empty">
        No chrome elements yet. Use the buttons above to add one.
      </p>
    </div>
  </section>
</template>

<style scoped>
.chrome-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  flex-wrap: wrap;
}
.chrome-panel__actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.chrome-panel__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}
.chrome-panel__row {
  background: var(--cms-canvas);
  border: 1px solid var(--cms-line);
  border-radius: 0.5rem;
  padding: 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.chrome-panel__row-actions {
  display: flex;
  justify-content: flex-end;
}
.chrome-panel__empty {
  margin: 0;
  font-size: 1.3rem;
  color: var(--cms-ink-subtle);
}
</style>
