<script setup lang="ts">
import { computed } from 'vue'
import type { LayoutChromeElement } from '~/shared/types/layout'

const props = defineProps<{ element: LayoutChromeElement }>()
const emit = defineEmits<{
  'update:element': [patch: Partial<LayoutChromeElement>]
}>()

const element = computed(() => props.element)

function patch(p: Partial<LayoutChromeElement>) {
  emit('update:element', p)
}

/** Patch a numeric field; skip when input is empty so autosave doesn't write 0 mid-typing. */
function patchNumber(field: keyof LayoutChromeElement, raw: string) {
  if (raw === '') return
  const n = Number(raw)
  if (Number.isNaN(n)) return
  patch({ [field]: n } as any)
}

/** Patch a string field; trim and ignore empty -> empty noop. */
function patchString(field: keyof LayoutChromeElement, raw: string) {
  patch({ [field]: raw } as any)
}

const idPrefix = computed(() => `chrome-${props.element.id}`)
</script>

<template>
  <div class="chrome-element-editor">
    <div class="chrome-element-editor__header">
      <strong>{{ element.type }}</strong>
      <code>{{ element.id }}</code>
    </div>

    <div class="chrome-element-editor__section">
      <div class="chrome-element-editor__section-title">Common</div>
      <div class="chrome-element-editor__grid">
        <div class="cms-form-group" data-field="enabled">
          <div class="form-check">
            <input
              :id="`${idPrefix}-enabled`"
              class="form-check-input"
              type="checkbox"
              :checked="element.enabled"
              @change="patch({ enabled: ($event.target as HTMLInputElement).checked } as any)"
            >
            <label class="form-check-label" :for="`${idPrefix}-enabled`">Enabled</label>
          </div>
        </div>

        <div class="cms-form-group" data-field="layer">
          <label class="cms-label" :for="`${idPrefix}-layer`">Layer</label>
          <select
            :id="`${idPrefix}-layer`"
            class="cms-form-control"
            :value="element.layer ?? 'foreground'"
            @change="patch({ layer: ($event.target as HTMLSelectElement).value as any } as any)"
          >
            <option value="background">background (behind content)</option>
            <option value="foreground">foreground (above content)</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="position">
          <label class="cms-label" :for="`${idPrefix}-position`">Position</label>
          <select
            :id="`${idPrefix}-position`"
            class="cms-form-control"
            :value="element.position"
            @change="patch({ position: ($event.target as HTMLSelectElement).value as any } as any)"
          >
            <option value="fixed">fixed</option>
            <option value="absolute">absolute</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="anchor">
          <label class="cms-label" :for="`${idPrefix}-anchor`">Anchor</label>
          <select
            :id="`${idPrefix}-anchor`"
            class="cms-form-control"
            :value="element.anchor"
            @change="patch({ anchor: ($event.target as HTMLSelectElement).value as any } as any)"
          >
            <option value="top-left">top-left</option>
            <option value="top-right">top-right</option>
            <option value="bottom-left">bottom-left</option>
            <option value="bottom-right">bottom-right</option>
            <option value="center">center</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="offsetX">
          <label class="cms-label" :for="`${idPrefix}-offset-x`">Offset X</label>
          <input
            :id="`${idPrefix}-offset-x`"
            type="text"
            class="cms-form-control"
            :value="element.offsetX"
            @input="patch({ offsetX: ($event.target as HTMLInputElement).value } as any)"
          >
        </div>

        <div class="cms-form-group" data-field="offsetY">
          <label class="cms-label" :for="`${idPrefix}-offset-y`">Offset Y</label>
          <input
            :id="`${idPrefix}-offset-y`"
            type="text"
            class="cms-form-control"
            :value="element.offsetY"
            @input="patch({ offsetY: ($event.target as HTMLInputElement).value } as any)"
          >
        </div>

        <div class="cms-form-group" data-field="zIndex">
          <label class="cms-label" :for="`${idPrefix}-z-index`">z-index</label>
          <input
            :id="`${idPrefix}-z-index`"
            type="number"
            class="cms-form-control"
            :value="element.zIndex"
            @input="patchNumber('zIndex', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="cms-form-group" data-field="opacity">
          <label class="cms-label" :for="`${idPrefix}-opacity`">Opacity</label>
          <input
            :id="`${idPrefix}-opacity`"
            type="number"
            class="cms-form-control"
            step="0.05"
            min="0"
            max="1"
            :value="element.opacity ?? 1"
            @input="patchNumber('opacity', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="cms-form-group" data-field="blendMode">
          <label class="cms-label" :for="`${idPrefix}-blend-mode`">Blend mode</label>
          <input
            :id="`${idPrefix}-blend-mode`"
            type="text"
            class="cms-form-control"
            :value="element.blendMode ?? ''"
            placeholder="normal"
            @input="patch({ blendMode: ($event.target as HTMLInputElement).value } as any)"
          >
        </div>

        <div class="cms-form-group" data-field="pointerEvents">
          <label class="cms-label" :for="`${idPrefix}-pointer-events`">Pointer events</label>
          <select
            :id="`${idPrefix}-pointer-events`"
            class="cms-form-control"
            :value="element.pointerEvents ?? 'none'"
            @change="patch({ pointerEvents: ($event.target as HTMLSelectElement).value as any } as any)"
          >
            <option value="none">none</option>
            <option value="auto">auto</option>
          </select>
        </div>

        <div class="cms-form-group" data-field="hideBelow">
          <label class="cms-label" :for="`${idPrefix}-hide-below`">Hide below</label>
          <select
            :id="`${idPrefix}-hide-below`"
            class="cms-form-control"
            :value="element.hideBelow ?? ''"
            @change="patch({ hideBelow: (($event.target as HTMLSelectElement).value || null) as any } as any)"
          >
            <option value="">never</option>
            <option value="sm">sm</option>
            <option value="md">md</option>
            <option value="lg">lg</option>
          </select>
        </div>
      </div>
    </div>

    <template v-if="element.type === 'line'">
      <div class="chrome-element-editor__section">
        <div class="chrome-element-editor__section-title">Line</div>
        <div class="chrome-element-editor__grid">
          <div class="cms-form-group" data-field="orientation">
            <label class="cms-label" :for="`${idPrefix}-orientation`">Orientation</label>
            <select
              :id="`${idPrefix}-orientation`"
              class="cms-form-control"
              :value="element.orientation"
              @change="patch({ orientation: ($event.target as HTMLSelectElement).value as any } as any)"
            >
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
          </div>

          <div class="cms-form-group" data-field="color">
            <label class="cms-label" :for="`${idPrefix}-color`">Color</label>
            <div class="chrome-element-editor__color-row">
              <input
                :id="`${idPrefix}-color`"
                type="color"
                class="chrome-element-editor__color-swatch"
                :value="(element as any).color || '#000000'"
                @input="patchString('color', ($event.target as HTMLInputElement).value)"
              >
              <input
                type="text"
                class="cms-form-control"
                :value="(element as any).color"
                placeholder="#000000"
                @input="patchString('color', ($event.target as HTMLInputElement).value)"
              >
            </div>
          </div>

          <div class="cms-form-group" data-field="thickness">
            <label class="cms-label" :for="`${idPrefix}-thickness`">Thickness</label>
            <input
              :id="`${idPrefix}-thickness`"
              type="text"
              class="cms-form-control"
              :value="element.thickness"
              @input="patch({ thickness: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="length">
            <label class="cms-label" :for="`${idPrefix}-length`">Length</label>
            <input
              :id="`${idPrefix}-length`"
              type="text"
              class="cms-form-control"
              :value="element.length"
              @input="patch({ length: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>
        </div>
      </div>
    </template>

    <template v-if="element.type === 'shape'">
      <div class="chrome-element-editor__section">
        <div class="chrome-element-editor__section-title">Shape</div>
        <div class="chrome-element-editor__grid">
          <div class="cms-form-group" data-field="shape">
            <label class="cms-label" :for="`${idPrefix}-shape`">Shape</label>
            <select
              :id="`${idPrefix}-shape`"
              class="cms-form-control"
              :value="element.shape"
              @change="patch({ shape: ($event.target as HTMLSelectElement).value as any } as any)"
            >
              <option value="rectangle">rectangle</option>
              <option value="circle">circle</option>
              <option value="pill">pill</option>
            </select>
          </div>

          <div class="cms-form-group" data-field="color">
            <label class="cms-label" :for="`${idPrefix}-color`">Color</label>
            <div class="chrome-element-editor__color-row">
              <input
                :id="`${idPrefix}-color`"
                type="color"
                class="chrome-element-editor__color-swatch"
                :value="(element as any).color || '#000000'"
                @input="patchString('color', ($event.target as HTMLInputElement).value)"
              >
              <input
                type="text"
                class="cms-form-control"
                :value="(element as any).color"
                placeholder="#000000"
                @input="patchString('color', ($event.target as HTMLInputElement).value)"
              >
            </div>
          </div>

          <div class="cms-form-group" data-field="width">
            <label class="cms-label" :for="`${idPrefix}-width`">Width</label>
            <input
              :id="`${idPrefix}-width`"
              type="text"
              class="cms-form-control"
              :value="element.width"
              @input="patch({ width: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="height">
            <label class="cms-label" :for="`${idPrefix}-height`">Height</label>
            <input
              :id="`${idPrefix}-height`"
              type="text"
              class="cms-form-control"
              :value="element.height"
              @input="patch({ height: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="radius">
            <label class="cms-label" :for="`${idPrefix}-radius`">Radius</label>
            <input
              :id="`${idPrefix}-radius`"
              type="text"
              class="cms-form-control"
              :value="element.radius ?? ''"
              @input="patch({ radius: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="rotation">
            <label class="cms-label" :for="`${idPrefix}-rotation`">Rotation</label>
            <input
              :id="`${idPrefix}-rotation`"
              type="text"
              class="cms-form-control"
              :value="element.rotation ?? ''"
              placeholder="0deg"
              @input="patch({ rotation: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>
        </div>
      </div>
    </template>

    <template v-if="element.type === 'image'">
      <div class="chrome-element-editor__section">
        <div class="chrome-element-editor__section-title">Image</div>
        <div class="chrome-element-editor__grid">
          <div class="cms-form-group" data-field="src">
            <label class="cms-label" :for="`${idPrefix}-src`">Source URL</label>
            <input
              :id="`${idPrefix}-src`"
              type="text"
              class="cms-form-control"
              :value="element.src"
              @input="patch({ src: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="alt">
            <label class="cms-label" :for="`${idPrefix}-alt`">Alt text</label>
            <input
              :id="`${idPrefix}-alt`"
              type="text"
              class="cms-form-control"
              :value="element.alt ?? ''"
              @input="patch({ alt: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="width">
            <label class="cms-label" :for="`${idPrefix}-width`">Width</label>
            <input
              :id="`${idPrefix}-width`"
              type="text"
              class="cms-form-control"
              :value="element.width"
              @input="patch({ width: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="height">
            <label class="cms-label" :for="`${idPrefix}-height`">Height</label>
            <input
              :id="`${idPrefix}-height`"
              type="text"
              class="cms-form-control"
              :value="element.height ?? ''"
              @input="patch({ height: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="objectFit">
            <label class="cms-label" :for="`${idPrefix}-object-fit`">Object fit</label>
            <select
              :id="`${idPrefix}-object-fit`"
              class="cms-form-control"
              :value="element.objectFit ?? 'contain'"
              @change="patch({ objectFit: ($event.target as HTMLSelectElement).value as any } as any)"
            >
              <option value="contain">contain</option>
              <option value="cover">cover</option>
            </select>
          </div>

          <div class="cms-form-group" data-field="rotation">
            <label class="cms-label" :for="`${idPrefix}-rotation`">Rotation</label>
            <input
              :id="`${idPrefix}-rotation`"
              type="text"
              class="cms-form-control"
              :value="element.rotation ?? ''"
              placeholder="0deg"
              @input="patch({ rotation: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>
        </div>
      </div>
    </template>

    <template v-if="element.type === 'text'">
      <div class="chrome-element-editor__section">
        <div class="chrome-element-editor__section-title">Text</div>
        <div class="chrome-element-editor__grid">
          <div class="cms-form-group" data-field="text">
            <label class="cms-label" :for="`${idPrefix}-text`">Text</label>
            <input
              :id="`${idPrefix}-text`"
              type="text"
              class="cms-form-control"
              :value="element.text"
              @input="patch({ text: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="color">
            <label class="cms-label" :for="`${idPrefix}-color`">Color</label>
            <div class="chrome-element-editor__color-row">
              <input
                :id="`${idPrefix}-color`"
                type="color"
                class="chrome-element-editor__color-swatch"
                :value="(element as any).color || '#000000'"
                @input="patchString('color', ($event.target as HTMLInputElement).value)"
              >
              <input
                type="text"
                class="cms-form-control"
                :value="(element as any).color ?? ''"
                placeholder="(inherit)"
                @input="patchString('color', ($event.target as HTMLInputElement).value)"
              >
            </div>
          </div>

          <div class="cms-form-group" data-field="typographyPresetKey">
            <label class="cms-label" :for="`${idPrefix}-typography-preset`">Typography preset</label>
            <input
              :id="`${idPrefix}-typography-preset`"
              type="text"
              class="cms-form-control"
              :value="element.typographyPresetKey ?? ''"
              @input="patch({ typographyPresetKey: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>

          <div class="cms-form-group" data-field="rotation">
            <label class="cms-label" :for="`${idPrefix}-rotation`">Rotation</label>
            <input
              :id="`${idPrefix}-rotation`"
              type="text"
              class="cms-form-control"
              :value="element.rotation ?? ''"
              placeholder="0deg"
              @input="patch({ rotation: ($event.target as HTMLInputElement).value } as any)"
            >
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chrome-element-editor {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.chrome-element-editor__header {
  display: flex;
  gap: 0.8rem;
  align-items: center;
}
.chrome-element-editor__header strong {
  text-transform: uppercase;
  font-size: 1.2rem;
  letter-spacing: 0.05em;
  color: var(--cms-ink-muted);
}
.chrome-element-editor__header code {
  font-size: 1.2rem;
  color: var(--cms-ink-subtle);
}
.chrome-element-editor__section {
  padding: 1.2rem 0;
  border-top: 1px solid var(--cms-line);
}
.chrome-element-editor__section:first-of-type {
  padding-top: 0;
  border-top: 0;
}
.chrome-element-editor__section-title {
  font-size: 1.2rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cms-ink-muted);
  margin-bottom: 1rem;
}
.chrome-element-editor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.2rem;
}
.chrome-element-editor__color-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}
.chrome-element-editor__color-swatch {
  width: 3.8rem;
  height: 3.8rem;
  flex-shrink: 0;
  padding: 0.2rem;
  border: 1px solid #cfd2d4;
  border-radius: 0.3rem;
  cursor: pointer;
  background: var(--cms-surface);
}
</style>
