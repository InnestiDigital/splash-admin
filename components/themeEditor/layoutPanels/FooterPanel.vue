<script setup lang="ts">
import type { LayoutFooterConfig } from '~/shared/types/layout'

const props = defineProps<{ config: Partial<LayoutFooterConfig> }>()
const emit = defineEmits<{ 'update:config': [patch: Partial<LayoutFooterConfig>] }>()

function patch(p: Partial<LayoutFooterConfig>) {
  emit('update:config', p)
}

function patchPalette(p: Partial<NonNullable<LayoutFooterConfig['palette']>>) {
  emit('update:config', { palette: { ...(props.config.palette ?? {}), ...p } })
}
</script>

<template>
  <section class="cms-card footer-panel">
    <div class="cms-card__header">
      <h3 class="cms-card__title">Footer</h3>
    </div>
    <div class="cms-card__body">
      <div class="footer-panel__section">
        <div class="footer-panel__grid">
          <div class="cms-form-group" data-field="enabled">
            <div class="form-check">
              <input
                id="footer-enabled"
                class="form-check-input"
                type="checkbox"
                :checked="props.config.enabled ?? true"
                @change="patch({ enabled: ($event.target as HTMLInputElement).checked })"
              >
              <label class="form-check-label" for="footer-enabled">Enabled</label>
            </div>
          </div>

          <div class="cms-form-group" data-field="position">
            <label class="cms-label" for="footer-position">Position</label>
            <select
              id="footer-position"
              class="cms-form-control"
              :value="props.config.position ?? 'normal'"
              @change="patch({ position: ($event.target as HTMLSelectElement).value as any })"
            >
              <option value="normal">normal</option>
              <option value="sticky-bottom">sticky-bottom</option>
            </select>
          </div>
        </div>
      </div>

      <div class="footer-panel__section">
        <div class="footer-panel__section-title">Palette</div>
        <div class="footer-panel__grid">
          <div class="cms-form-group" data-field="palette.bgColor">
            <label class="cms-label" for="footer-palette-bg-color">Bg color</label>
            <input
              id="footer-palette-bg-color"
              type="text"
              class="cms-form-control"
              :value="props.config.palette?.bgColor ?? ''"
              @input="patchPalette({ bgColor: ($event.target as HTMLInputElement).value })"
            >
          </div>

          <div class="cms-form-group" data-field="palette.textColor">
            <label class="cms-label" for="footer-palette-text-color">Text color</label>
            <input
              id="footer-palette-text-color"
              type="text"
              class="cms-form-control"
              :value="props.config.palette?.textColor ?? ''"
              @input="patchPalette({ textColor: ($event.target as HTMLInputElement).value })"
            >
          </div>

          <div class="cms-form-group" data-field="palette.linkColor">
            <label class="cms-label" for="footer-palette-link-color">Link color</label>
            <input
              id="footer-palette-link-color"
              type="text"
              class="cms-form-control"
              :value="props.config.palette?.linkColor ?? ''"
              @input="patchPalette({ linkColor: ($event.target as HTMLInputElement).value })"
            >
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.footer-panel__section {
  padding: 1.6rem 0;
  border-top: 1px solid var(--cms-line);
}
.footer-panel__section:first-child {
  padding-top: 0;
  border-top: 0;
}
.footer-panel__section-title {
  font-size: 1.3rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cms-ink-muted);
  margin-bottom: 1.2rem;
}
.footer-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
}
</style>
