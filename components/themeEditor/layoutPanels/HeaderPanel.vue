<script setup lang="ts">
import type { LayoutHeaderConfig } from '~/shared/types/layout'

const props = defineProps<{ config: Partial<LayoutHeaderConfig> }>()
const emit = defineEmits<{ 'update:config': [patch: Partial<LayoutHeaderConfig>] }>()
const paletteFields = [
  ['bgColor', 'Background'],
  ['textColor', 'Text'],
  ['navLinkColor', 'Navigation link'],
  ['navLinkHoverColor', 'Navigation hover'],
  ['accentBarColor', 'Accent bar'],
] as const

function patch(patch: Partial<LayoutHeaderConfig>) {
  emit('update:config', patch)
}

function patchPalette(palette: Partial<LayoutHeaderConfig['palette']>) {
  patch({ palette: { ...(props.config.palette ?? {}), ...palette } })
}
</script>

<template>
  <section class="cms-card header-panel">
    <div class="cms-card__header">
      <h3 class="cms-card__title">Header</h3>
    </div>
    <div class="cms-card__body">
      <div class="header-panel__section">
        <div class="form-check" data-field="enabled">
          <input
            id="header-enabled"
            class="form-check-input"
            type="checkbox"
            :checked="props.config.enabled ?? true"
            @change="patch({ enabled: ($event.target as HTMLInputElement).checked })"
          >
          <label class="form-check-label" for="header-enabled">Enabled</label>
        </div>
      </div>

      <div class="header-panel__section">
        <div class="header-panel__section-title">Palette</div>
        <div class="header-panel__grid">
          <div
            v-for="field in paletteFields"
            :key="field[0]"
            class="cms-form-group"
            :data-field="`palette.${field[0]}`"
          >
            <label class="cms-label" :for="`header-palette-${field[0]}`">{{ field[1] }}</label>
            <input
              :id="`header-palette-${field[0]}`"
              type="text"
              class="cms-form-control"
              :value="props.config.palette?.[field[0]] ?? ''"
              @input="patchPalette({ [field[0]]: ($event.target as HTMLInputElement).value })"
            >
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.header-panel__section {
  padding: 1.6rem 0;
  border-top: 1px solid var(--cms-line);
}
.header-panel__section:first-child {
  padding-top: 0;
  border-top: 0;
}
.header-panel__section-title {
  margin-bottom: 1.2rem;
  color: var(--cms-ink-muted);
  font-size: 1.3rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.header-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
}
</style>
