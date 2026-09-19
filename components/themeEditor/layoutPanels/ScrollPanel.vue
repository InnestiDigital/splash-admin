<script setup lang="ts">
import type { LayoutScrollConfig } from '~/shared/types/layout'

const props = defineProps<{ config: Partial<LayoutScrollConfig> }>()
const emit = defineEmits<{ 'update:config': [patch: Partial<LayoutScrollConfig>] }>()

function patch(p: Partial<LayoutScrollConfig>) {
  emit('update:config', p)
}
</script>

<template>
  <section class="cms-card scroll-panel">
    <div class="cms-card__header">
      <h3 class="cms-card__title">Scroll</h3>
    </div>
    <div class="cms-card__body">
      <div class="scroll-panel__grid">
        <div class="cms-form-group" data-field="mode">
          <label class="cms-label" for="scroll-mode">Mode</label>
          <select
            id="scroll-mode"
            class="cms-form-control"
            :value="props.config.mode ?? 'normal'"
            @change="patch({ mode: ($event.target as HTMLSelectElement).value as any })"
          >
            <option value="normal">normal</option>
            <option value="snap-y">snap-y</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="snapType">
          <label class="cms-label" for="scroll-snap-type">Snap type</label>
          <select
            id="scroll-snap-type"
            class="cms-form-control"
            :value="props.config.snapType ?? 'proximity'"
            @change="patch({ snapType: ($event.target as HTMLSelectElement).value as any })"
          >
            <option value="mandatory">mandatory</option>
            <option value="proximity">proximity</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="snapAlign">
          <label class="cms-label" for="scroll-snap-align">Snap align</label>
          <select
            id="scroll-snap-align"
            class="cms-form-control"
            :value="props.config.snapAlign ?? 'start'"
            @change="patch({ snapAlign: ($event.target as HTMLSelectElement).value as any })"
          >
            <option value="start">start</option>
            <option value="center">center</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="smoothScroll">
          <div class="form-check">
            <input
              id="scroll-smooth-scroll"
              class="form-check-input"
              type="checkbox"
              :checked="props.config.smoothScroll ?? false"
              @change="patch({ smoothScroll: ($event.target as HTMLInputElement).checked })"
            >
            <label class="form-check-label" for="scroll-smooth-scroll">Smooth scroll</label>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.scroll-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
}
</style>
