<script setup lang="ts">
import type { LayoutBackgroundConfig } from '~/shared/types/layout'

const props = defineProps<{ config: Partial<LayoutBackgroundConfig> }>()
const emit = defineEmits<{ 'update:config': [patch: Partial<LayoutBackgroundConfig>] }>()

function patch(p: Partial<LayoutBackgroundConfig>) {
  emit('update:config', p)
}

function patchImage(p: Partial<NonNullable<LayoutBackgroundConfig['image']>>) {
  emit('update:config', {
    image: {
      ...(props.config.image ?? { src: '', repeat: 'none', size: 'cover', position: 'center', attachment: 'scroll' }),
      ...p,
    },
  })
}

function patchOverlay(p: Partial<NonNullable<LayoutBackgroundConfig['overlay']>>) {
  emit('update:config', {
    overlay: { ...(props.config.overlay ?? { color: '#000', opacity: 0 }), ...p },
  })
}

function patchTexture(p: Partial<NonNullable<LayoutBackgroundConfig['texture']>>) {
  emit('update:config', {
    texture: { ...(props.config.texture ?? { type: 'noise', opacity: 0 }), ...p },
  })
}
</script>

<template>
  <section class="cms-card background-panel">
    <div class="cms-card__header">
      <h3 class="cms-card__title">Background</h3>
    </div>
    <div class="cms-card__body">
      <div class="background-panel__section">
        <div class="cms-form-group" data-field="color">
          <label class="cms-label" for="background-color">Color</label>
          <input
            id="background-color"
            type="text"
            class="cms-form-control"
            :value="props.config.color ?? ''"
            placeholder="#FFFFFF"
            @input="patch({ color: ($event.target as HTMLInputElement).value })"
          >
        </div>
      </div>

      <div class="background-panel__section">
        <div class="background-panel__section-title">Image</div>
        <div class="background-panel__grid">
          <div class="cms-form-group" data-field="image.src">
            <label class="cms-label" for="background-image-src">Source</label>
            <input
              id="background-image-src"
              type="text"
              class="cms-form-control"
              :value="props.config.image?.src ?? ''"
              @input="patchImage({ src: ($event.target as HTMLInputElement).value })"
            >
          </div>

          <div class="cms-form-group" data-field="image.repeat">
            <label class="cms-label" for="background-image-repeat">Repeat</label>
            <select
              id="background-image-repeat"
              class="cms-form-control"
              :value="props.config.image?.repeat ?? 'none'"
              @change="patchImage({ repeat: ($event.target as HTMLSelectElement).value as any })"
            >
              <option value="none">none</option>
              <option value="repeat">repeat</option>
              <option value="repeat-x">repeat-x</option>
              <option value="repeat-y">repeat-y</option>
            </select>
          </div>

          <div class="cms-form-group" data-field="image.size">
            <label class="cms-label" for="background-image-size">Size</label>
            <input
              id="background-image-size"
              type="text"
              class="cms-form-control"
              :value="props.config.image?.size ?? 'cover'"
              @input="patchImage({ size: ($event.target as HTMLInputElement).value as any })"
            >
          </div>

          <div class="cms-form-group" data-field="image.position">
            <label class="cms-label" for="background-image-position">Position</label>
            <input
              id="background-image-position"
              type="text"
              class="cms-form-control"
              :value="props.config.image?.position ?? 'center'"
              @input="patchImage({ position: ($event.target as HTMLInputElement).value })"
            >
          </div>

          <div class="cms-form-group" data-field="image.attachment">
            <label class="cms-label" for="background-image-attachment">Attachment</label>
            <select
              id="background-image-attachment"
              class="cms-form-control"
              :value="props.config.image?.attachment ?? 'scroll'"
              @change="patchImage({ attachment: ($event.target as HTMLSelectElement).value as any })"
            >
              <option value="scroll">scroll</option>
              <option value="fixed">fixed</option>
            </select>
          </div>

          <div class="cms-form-group" data-field="image.opacity">
            <label class="cms-label" for="background-image-opacity">Opacity</label>
            <input
              id="background-image-opacity"
              type="number"
              class="cms-form-control"
              step="0.05"
              min="0"
              max="1"
              :value="props.config.image?.opacity ?? 1"
              @input="patchImage({ opacity: Number(($event.target as HTMLInputElement).value) })"
            >
          </div>
        </div>
      </div>

      <div class="background-panel__section">
        <div class="background-panel__section-title">Overlay</div>
        <div class="background-panel__grid">
          <div class="cms-form-group" data-field="overlay.color">
            <label class="cms-label" for="background-overlay-color">Color</label>
            <input
              id="background-overlay-color"
              type="text"
              class="cms-form-control"
              :value="props.config.overlay?.color ?? ''"
              @input="patchOverlay({ color: ($event.target as HTMLInputElement).value })"
            >
          </div>

          <div class="cms-form-group" data-field="overlay.opacity">
            <label class="cms-label" for="background-overlay-opacity">Opacity</label>
            <input
              id="background-overlay-opacity"
              type="number"
              class="cms-form-control"
              step="0.05"
              min="0"
              max="1"
              :value="props.config.overlay?.opacity ?? 0"
              @input="patchOverlay({ opacity: Number(($event.target as HTMLInputElement).value) })"
            >
          </div>

          <div class="cms-form-group" data-field="overlay.blendMode">
            <label class="cms-label" for="background-overlay-blend-mode">Blend mode</label>
            <input
              id="background-overlay-blend-mode"
              type="text"
              class="cms-form-control"
              :value="props.config.overlay?.blendMode ?? ''"
              @input="patchOverlay({ blendMode: ($event.target as HTMLInputElement).value })"
            >
          </div>
        </div>
      </div>

      <div class="background-panel__section">
        <div class="background-panel__section-title">Texture</div>
        <div class="background-panel__grid">
          <div class="cms-form-group" data-field="texture.type">
            <label class="cms-label" for="background-texture-type">Type</label>
            <select
              id="background-texture-type"
              class="cms-form-control"
              :value="props.config.texture?.type ?? 'noise'"
              @change="patchTexture({ type: ($event.target as HTMLSelectElement).value as any })"
            >
              <option value="noise">noise</option>
              <option value="grain">grain</option>
            </select>
          </div>

          <div class="cms-form-group" data-field="texture.opacity">
            <label class="cms-label" for="background-texture-opacity">Opacity</label>
            <input
              id="background-texture-opacity"
              type="number"
              class="cms-form-control"
              step="0.05"
              min="0"
              max="1"
              :value="props.config.texture?.opacity ?? 0"
              @input="patchTexture({ opacity: Number(($event.target as HTMLInputElement).value) })"
            >
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.background-panel__section {
  padding: 1.6rem 0;
  border-top: 1px solid var(--cms-line);
}
.background-panel__section:first-child {
  padding-top: 0;
  border-top: 0;
}
.background-panel__section-title {
  font-size: 1.3rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cms-ink-muted);
  margin-bottom: 1.2rem;
}
.background-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
}
</style>
