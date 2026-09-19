<script setup lang="ts">
import { computed } from 'vue'
import type { LayoutFrameConfig } from '~/shared/types/layout'
import { LAYOUT_CONTAINER_MODES } from '~/shared/types/layout'

const props = defineProps<{ config: Partial<LayoutFrameConfig> }>()
const emit = defineEmits<{ 'update:config': [patch: Partial<LayoutFrameConfig>] }>()

function patch(p: Partial<LayoutFrameConfig>) {
  emit('update:config', p)
}

/** Skip empty input so autosave doesn't write 0 mid-typing for numeric fields. */
function patchNumber(field: keyof LayoutFrameConfig, raw: string) {
  if (raw === '') return
  const n = Number(raw)
  if (Number.isNaN(n)) return
  patch({ [field]: n } as any)
}

const isScale = computed(() => props.config.responsiveMode === 'scale')
</script>

<template>
  <section class="cms-card frame-panel">
    <div class="cms-card__header">
      <h3 class="cms-card__title">Frame</h3>
    </div>
    <div class="cms-card__body">
      <div class="frame-panel__grid">
        <div class="cms-form-group" data-field="containerMode">
          <label class="cms-label" for="frame-container-mode">Container mode</label>
          <select
            id="frame-container-mode"
            class="cms-form-control"
            :value="props.config.containerMode ?? 'measure'"
            @change="patch({ containerMode: ($event.target as HTMLSelectElement).value as any })"
          >
            <option v-for="mode in LAYOUT_CONTAINER_MODES" :key="mode" :value="mode">{{ mode }}</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="maxWidth">
          <label class="cms-label" for="frame-max-width">Max width</label>
          <input
            id="frame-max-width"
            type="text"
            class="cms-form-control"
            :value="props.config.maxWidth ?? ''"
            placeholder="1200px"
            @input="patch({ maxWidth: ($event.target as HTMLInputElement).value })"
          >
        </div>

        <div class="cms-form-group" data-field="insetX">
          <label class="cms-label" for="frame-inset-x">Inset X</label>
          <input
            id="frame-inset-x"
            type="text"
            class="cms-form-control"
            :value="props.config.insetX ?? 'md'"
            @input="patch({ insetX: ($event.target as HTMLInputElement).value as any })"
          >
        </div>

        <div class="cms-form-group" data-field="minHeight">
          <label class="cms-label" for="frame-min-height">Min height</label>
          <input
            id="frame-min-height"
            type="text"
            class="cms-form-control"
            :value="props.config.minHeight ?? ''"
            placeholder="100vh"
            @input="patch({ minHeight: ($event.target as HTMLInputElement).value })"
          >
        </div>

        <div class="cms-form-group" data-field="overflowX">
          <label class="cms-label" for="frame-overflow-x">Overflow X</label>
          <select
            id="frame-overflow-x"
            class="cms-form-control"
            :value="props.config.overflowX ?? 'visible'"
            @change="patch({ overflowX: ($event.target as HTMLSelectElement).value as any })"
          >
            <option value="visible">visible</option>
            <option value="hidden">hidden</option>
            <option value="clip">clip</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="sectionSpacingDefault">
          <label class="cms-label" for="frame-section-spacing">Section spacing default</label>
          <select
            id="frame-section-spacing"
            class="cms-form-control"
            :value="props.config.sectionSpacingDefault ?? 'md'"
            @change="patch({ sectionSpacingDefault: ($event.target as HTMLSelectElement).value as any })"
          >
            <option value="none">none</option>
            <option value="sm">sm</option>
            <option value="md">md</option>
            <option value="lg">lg</option>
            <option value="xl">xl</option>
          </select>
        </div>
      </div>

      <div class="frame-panel__section">
        <div class="frame-panel__section-title">Responsive</div>
        <div class="frame-panel__grid">
          <div class="cms-form-group" data-field="responsiveMode">
            <label class="cms-label" for="frame-responsive-mode">Mode</label>
            <select
              id="frame-responsive-mode"
              class="cms-form-control"
              :value="props.config.responsiveMode ?? 'breakpoint'"
              @change="patch({ responsiveMode: ($event.target as HTMLSelectElement).value as any })"
            >
              <option value="breakpoint">Breakpoint (default)</option>
              <option value="scale">Scale (Readymag-style)</option>
            </select>
          </div>

          <template v-if="isScale">
            <div class="cms-form-group" data-field="designWidth">
              <label class="cms-label" for="frame-design-width">Design width (px)</label>
              <input
                id="frame-design-width"
                type="number"
                min="320"
                step="10"
                class="cms-form-control"
                :value="props.config.designWidth ?? 1440"
                @input="patchNumber('designWidth', ($event.target as HTMLInputElement).value)"
              >
            </div>

            <div class="cms-form-group" data-field="minScale">
              <label class="cms-label" for="frame-min-scale">Min scale</label>
              <input
                id="frame-min-scale"
                type="number"
                step="0.05"
                min="0"
                max="1"
                class="cms-form-control"
                :value="props.config.minScale ?? 0.25"
                @input="patchNumber('minScale', ($event.target as HTMLInputElement).value)"
              >
            </div>

            <div class="cms-form-group" data-field="maxScale">
              <label class="cms-label" for="frame-max-scale">Max scale</label>
              <input
                id="frame-max-scale"
                type="number"
                step="0.05"
                min="0"
                class="cms-form-control"
                :value="props.config.maxScale ?? 1"
                @input="patchNumber('maxScale', ($event.target as HTMLInputElement).value)"
              >
            </div>

            <div class="cms-form-group" data-field="scaleOrigin">
              <label class="cms-label" for="frame-scale-origin">Scale origin</label>
              <select
                id="frame-scale-origin"
                class="cms-form-control"
                :value="props.config.scaleOrigin ?? 'top-center'"
                @change="patch({ scaleOrigin: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="top-left">top-left</option>
                <option value="top-center">top-center</option>
              </select>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.frame-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
}

.frame-panel__section {
  padding: 1.6rem 0 0;
  margin-top: 1.6rem;
  border-top: 1px solid var(--cms-line);
}

.frame-panel__section-title {
  font-size: 1.2rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cms-ink-muted);
  margin-bottom: 1.2rem;
}
</style>
