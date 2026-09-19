<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SectionPreset } from '~/shared/types/sectionTypes'
import sectionPresetsData from '~/themes/standalone/section-presets.json'

const emit = defineEmits<{
  select: [preset: SectionPreset]
  cancel: []
  scratch: []
}>()

const sectionPresets = computed(() => sectionPresetsData as SectionPreset[])

const locale = ref('en-US')

function getLabel(labelObj: { [key: string]: string } | string): string {
  if (typeof labelObj === 'string') return labelObj
  return labelObj[locale.value] || labelObj['en-US'] || Object.values(labelObj)[0] || ''
}

function onSelectPreset(preset: SectionPreset) {
  emit('select', preset)
}

function onCreateFromScratch() {
  emit('scratch')
}

function onCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="preset-picker">
    <div class="preset-picker__header">
      <h3 class="preset-picker__title">Add Section</h3>
      <button class="preset-picker__close" @click="onCancel" title="Close">×</button>
    </div>

    <div class="preset-picker__tabs">
      <div class="preset-picker__tab-nav">
        <button class="preset-picker__tab preset-picker__tab--active">Templates</button>
        <button class="preset-picker__tab" @click="onCreateFromScratch">From Scratch</button>
      </div>
    </div>

    <div class="preset-picker__body">
      <div class="preset-picker__grid">
        <div
          v-for="preset in sectionPresets"
          :key="preset.id"
          class="preset-card"
          @click="onSelectPreset(preset)"
        >
          <div class="preset-card__preview">
            <img
              v-if="preset.preview"
              :src="preset.preview"
              :alt="getLabel(preset.label)"
              class="preset-card__image"
            />
            <div v-else class="preset-card__placeholder">
              <span class="preset-card__icon">📋</span>
            </div>
          </div>
          <div class="preset-card__content">
            <h4 class="preset-card__title">{{ getLabel(preset.label) }}</h4>
            <p v-if="preset.description" class="preset-card__description">
              {{ getLabel(preset.description) }}
            </p>
            <div class="preset-card__meta">
              <span class="preset-card__type">{{ preset.sectionType }}</span>
              <span class="preset-card__count">{{ preset.blocks.length }} blocks</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preset-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.preset-picker__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e5e5;
}

.preset-picker__title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #1C1C1C;
}

.preset-picker__close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--cms-ink-subtle);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.15s;
}

.preset-picker__close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--cms-ink-muted);
}

.preset-picker__tabs {
  border-bottom: 1px solid #e5e5e5;
  padding: 0 20px;
}

.preset-picker__tab-nav {
  display: flex;
  gap: 4px;
}

.preset-picker__tab {
  background: none;
  border: none;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--cms-ink-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  position: relative;
  top: 1px;
}

.preset-picker__tab:hover {
  color: var(--cms-accent);
}

.preset-picker__tab--active {
  color: var(--cms-accent);
  border-bottom-color: var(--cms-accent);
}

.preset-picker__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
}

.preset-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.preset-card {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--cms-motion-normal) var(--cms-ease-out), box-shadow var(--cms-motion-normal) var(--cms-ease-out), transform var(--cms-motion-normal) var(--cms-ease-out);
  background: white;
}

.preset-card:hover {
  border-color: var(--cms-accent);
  box-shadow: 0 4px 12px rgba(0, 102, 255, 0.1);
  transform: translateY(-2px);
}

.preset-card__preview {
  width: 100%;
  height: 180px;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preset-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preset-card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.preset-card__icon {
  font-size: 48px;
  opacity: 0.3;
}

.preset-card__content {
  padding: 16px;
}

.preset-card__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #1C1C1C;
}

.preset-card__description {
  font-size: 13px;
  color: var(--cms-ink-muted);
  margin: 0 0 12px 0;
  line-height: 1.5;
}

.preset-card__meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--cms-ink-subtle);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preset-card__type {
  font-weight: 600;
}

.preset-card__count {
  opacity: 0.7;
}
</style>
