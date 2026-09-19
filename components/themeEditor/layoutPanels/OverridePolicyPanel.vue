<script setup lang="ts">
import type { LayoutOverridePolicy } from '~/shared/types/layout'

const props = defineProps<{ config: Partial<LayoutOverridePolicy> }>()
const emit = defineEmits<{ 'update:config': [patch: Partial<LayoutOverridePolicy>] }>()

function patch(p: Partial<LayoutOverridePolicy>) {
  emit('update:config', p)
}
</script>

<template>
  <section class="cms-card override-policy-panel">
    <div class="cms-card__header">
      <h3 class="cms-card__title">Override policy</h3>
    </div>
    <div class="cms-card__body">
      <p class="override-policy-panel__hint">
        Controls which layout sections page authors may override on a per-page basis.
      </p>

      <div class="override-policy-panel__grid">
        <div class="cms-form-group" data-field="allowPageHeaderOverride">
          <div class="form-check">
            <input
              id="override-allow-header"
              class="form-check-input"
              type="checkbox"
              :checked="props.config.allowPageHeaderOverride ?? false"
              @change="patch({ allowPageHeaderOverride: ($event.target as HTMLInputElement).checked })"
            >
            <label class="form-check-label" for="override-allow-header">Allow page header override</label>
          </div>
        </div>

        <div class="cms-form-group" data-field="allowPageFooterOverride">
          <div class="form-check">
            <input
              id="override-allow-footer"
              class="form-check-input"
              type="checkbox"
              :checked="props.config.allowPageFooterOverride ?? false"
              @change="patch({ allowPageFooterOverride: ($event.target as HTMLInputElement).checked })"
            >
            <label class="form-check-label" for="override-allow-footer">Allow page footer override</label>
          </div>
        </div>

        <div class="cms-form-group" data-field="allowPageBackgroundOverride">
          <div class="form-check">
            <input
              id="override-allow-background"
              class="form-check-input"
              type="checkbox"
              :checked="props.config.allowPageBackgroundOverride ?? false"
              @change="patch({ allowPageBackgroundOverride: ($event.target as HTMLInputElement).checked })"
            >
            <label class="form-check-label" for="override-allow-background">Allow page background override</label>
          </div>
        </div>

        <div class="cms-form-group" data-field="allowPageChromeOverride">
          <div class="form-check">
            <input
              id="override-allow-chrome"
              class="form-check-input"
              type="checkbox"
              :checked="props.config.allowPageChromeOverride ?? false"
              @change="patch({ allowPageChromeOverride: ($event.target as HTMLInputElement).checked })"
            >
            <label class="form-check-label" for="override-allow-chrome">Allow page chrome override</label>
          </div>
        </div>

        <div class="cms-form-group" data-field="allowPageChromeAdditions">
          <div class="form-check">
            <input
              id="override-allow-chrome-additions"
              class="form-check-input"
              type="checkbox"
              :checked="props.config.allowPageChromeAdditions ?? false"
              @change="patch({ allowPageChromeAdditions: ($event.target as HTMLInputElement).checked })"
            >
            <label class="form-check-label" for="override-allow-chrome-additions">Allow page chrome additions</label>
          </div>
        </div>

        <div class="cms-form-group" data-field="allowPageScrollOverride">
          <div class="form-check">
            <input
              id="override-allow-scroll"
              class="form-check-input"
              type="checkbox"
              :checked="props.config.allowPageScrollOverride ?? false"
              @change="patch({ allowPageScrollOverride: ($event.target as HTMLInputElement).checked })"
            >
            <label class="form-check-label" for="override-allow-scroll">Allow page scroll override</label>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.override-policy-panel__hint {
  margin: 0 0 1.6rem;
  font-size: 1.3rem;
  color: var(--cms-ink-muted);
}
.override-policy-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.2rem;
}
</style>
