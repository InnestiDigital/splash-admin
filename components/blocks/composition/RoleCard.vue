<template>
  <div class="role-card" :class="{ 'role-card--optional': !required }">
    <div class="role-card__header">
      <span class="role-card__label">{{ label }}</span>
      <span class="role-card__role-tag">{{ item.role }}</span>
      <button
        v-if="!required"
        class="role-card__remove"
        @click="$emit('toggle-visible', false)"
        title="Remove"
      >&times;</button>
    </div>

    <!-- Media content -->
    <div v-if="contentType === 'media'" class="role-card__media">
      <TImagePicker
        :field="imageField"
        :model-value="item.media?.src || ''"
        @update:model-value="onImageChange"
      />
      <div v-if="item.media?.src" class="role-card__focal">
        <label class="role-card__focal-label">Focal Point</label>
        <FocalPointPicker
          :src="item.media.src"
          :model-value="item.media.focalPoint || { x: 0.5, y: 0.5 }"
          @update:model-value="onFocalChange"
        />
      </div>
      <input
        type="text"
        :value="item.media?.alt?.['en-US'] || ''"
        placeholder="Alt text"
        class="role-card__alt-input"
        @input="onAltChange(($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Text content -->
    <div v-else class="role-card__text">
      <TRichTextEditor
        :field="textField"
        :model-value="item.textContent || {}"
        @update:model-value="onTextChange"
      />
    </div>

    <!-- Emphasis -->
    <div class="role-card__emphasis">
      <label class="role-card__emphasis-label">Emphasis</label>
      <select
        :value="item.emphasis"
        class="role-card__select"
        @change="onEmphasisChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="sm">Small</option>
        <option value="md">Medium</option>
        <option value="lg">Large</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TImagePicker from '~/admin/components/fields/TImagePicker.vue'
import TRichTextEditor from '~/admin/components/fields/TRichTextEditor.vue'
import FocalPointPicker from './FocalPointPicker.vue'
import type { CompositionItem, Emphasis } from '~/shared/features/cms/composition/types'

const props = defineProps<{
  item: CompositionItem
  label: string
  contentType: 'media' | 'text' | 'either'
  required: boolean
}>()

const emit = defineEmits<{
  'update:item': [value: CompositionItem]
  'toggle-visible': [value: boolean]
}>()

const imageField = computed(() => ({
  type: 'image' as const,
  id: `${props.item.role}-media`,
  label: { 'en-US': 'Image' },
}))

const textField = computed(() => ({
  type: 'richtext' as const,
  id: `${props.item.role}-text`,
  label: { 'en-US': props.label },
  translatable: true,
  options: { toolbar: 'full' },
}))

function onImageChange(src: string | null) {
  emit('update:item', {
    ...props.item,
    media: src ? { ...(props.item.media || { src: '' }), src } : undefined,
  })
}

function onFocalChange(focalPoint: { x: number; y: number }) {
  emit('update:item', {
    ...props.item,
    media: { ...(props.item.media || { src: '' }), focalPoint },
  })
}

function onAltChange(alt: string) {
  emit('update:item', {
    ...props.item,
    media: { ...(props.item.media || { src: '' }), alt: { 'en-US': alt } },
  })
}

function onTextChange(textContent: Record<string, string>) {
  emit('update:item', { ...props.item, textContent })
}

function onEmphasisChange(emphasis: string) {
  emit('update:item', { ...props.item, emphasis: emphasis as Emphasis })
}
</script>

<style lang="scss" scoped>
.role-card {
  border: 1px solid var(--cms-line);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: var(--cms-surface);

  &--optional { border-style: dashed; }

  &__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  &__label { font-weight: 600; font-size: 0.8125rem; }
  &__role-tag { font-size: 0.6875rem; color: var(--cms-ink-subtle); }
  &__remove {
    margin-left: auto; border: none; background: none;
    cursor: pointer; font-size: 1.25rem; line-height: 1;
    color: var(--cms-ink-subtle);
    &:hover { color: var(--cms-danger); }
  }

  &__focal {
    margin: 0.5rem 0;
  }
  &__focal-label {
    display: block;
    font-size: 0.75rem;
    color: var(--cms-ink-subtle);
    margin-bottom: 0.25rem;
  }

  &__alt-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--cms-line);
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: inherit;
    margin-top: 0.375rem;
  }

  &__emphasis {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--cms-line);
  }
  &__emphasis-label { font-size: 0.75rem; color: var(--cms-ink-subtle); }
  &__select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--cms-line);
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: inherit;
  }
}
</style>
