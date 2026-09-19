<template>
  <div class="typography-diagnostics">
    <div v-if="loading" class="text-center py-4">
      <span class="cms-spinner" />
    </div>

    <div v-else-if="fetchError" class="cms-alert cms-alert--danger">
      <span class="material-icons-outlined cms-alert-icon">error</span>
      <div class="cms-alert-content">
        <div class="cms-alert-title">Could not load diagnostics</div>
        <div class="cms-alert-description">{{ fetchError }}</div>
      </div>
    </div>

    <template v-else>
      <div v-if="diagnostics.length === 0" class="typography-diagnostics__empty">
        <span class="material-icons-outlined typography-diagnostics__empty-icon">check_circle</span>
        <p>No issues found. All presets, roles, and references are valid.</p>
      </div>

      <template v-else>
        <!-- Error group -->
        <div v-if="errors.length > 0" class="typography-diagnostics__group">
          <h4 class="typography-diagnostics__group-title typography-diagnostics__group-title--error">
            <span class="material-icons-outlined">error</span>
            {{ errors.length }} Error{{ errors.length !== 1 ? 's' : '' }}
          </h4>
          <ul class="typography-diagnostics__list">
            <li v-for="d in errors" :key="d.code + d.key" class="typography-diagnostics__item typography-diagnostics__item--error">
              <span class="typography-diagnostics__code">{{ d.code }}</span>
              <span class="typography-diagnostics__message">{{ d.message }}</span>
            </li>
          </ul>
        </div>

        <!-- Warning group -->
        <div v-if="warnings.length > 0" class="typography-diagnostics__group">
          <h4 class="typography-diagnostics__group-title typography-diagnostics__group-title--warning">
            <span class="material-icons-outlined">warning</span>
            {{ warnings.length }} Warning{{ warnings.length !== 1 ? 's' : '' }}
          </h4>
          <ul class="typography-diagnostics__list">
            <li v-for="d in warnings" :key="d.code + d.key" class="typography-diagnostics__item typography-diagnostics__item--warning">
              <span class="typography-diagnostics__code">{{ d.code }}</span>
              <span class="typography-diagnostics__message">{{ d.message }}</span>
            </li>
          </ul>
        </div>

        <!-- Info group -->
        <div v-if="infos.length > 0" class="typography-diagnostics__group">
          <h4 class="typography-diagnostics__group-title typography-diagnostics__group-title--info">
            <span class="material-icons-outlined">info</span>
            {{ infos.length }} Info
          </h4>
          <ul class="typography-diagnostics__list">
            <li v-for="d in infos" :key="d.code + d.key" class="typography-diagnostics__item typography-diagnostics__item--info">
              <span class="typography-diagnostics__code">{{ d.code }}</span>
              <span class="typography-diagnostics__message">{{ d.message }}</span>
            </li>
          </ul>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import type { TypographyDiagnostic } from '~/shared/typography/diagnose'

const props = defineProps<{
  /** Incremented by parent to trigger a refresh after preset/role changes. */
  refreshKey?: number
}>()

const { siteFetch } = useSiteApi()

const loading = ref(false)
const fetchError = ref<string | null>(null)
const diagnostics = ref<TypographyDiagnostic[]>([])

const errors = computed(() => diagnostics.value.filter(d => d.severity === 'error'))
const warnings = computed(() => diagnostics.value.filter(d => d.severity === 'warning'))
const infos = computed(() => diagnostics.value.filter(d => d.severity === 'info'))

async function load() {
  loading.value = true
  fetchError.value = null
  try {
    const data = await siteFetch<{ diagnostics: TypographyDiagnostic[] }>('/typography/diagnostics')
    diagnostics.value = data.diagnostics
  } catch (err: any) {
    fetchError.value = err?.data?.statusMessage || 'Unknown error'
    diagnostics.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

watch(() => props.refreshKey, load)
</script>

<style scoped lang="scss">
.typography-diagnostics__empty {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--cms-ink-muted);

  p {
    margin: 0.5rem 0 0;
    font-size: 1.3rem;
  }
}

.typography-diagnostics__empty-icon {
  font-size: 4rem;
  color: var(--cms-accent);
}

.typography-diagnostics__group {
  margin-bottom: 2rem;
}

.typography-diagnostics__group-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.8rem;
  font-size: 1.3rem;
  font-weight: 600;

  .material-icons-outlined {
    font-size: 1.8rem;
  }

  &--error {
    color: #c62828;
    .material-icons-outlined { color: #c62828; }
  }
  &--warning {
    color: #e65100;
    .material-icons-outlined { color: #e65100; }
  }
  &--info {
    color: var(--cms-ink-muted);
    .material-icons-outlined { color: var(--cms-ink-muted); }
  }
}

.typography-diagnostics__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.typography-diagnostics__item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.8rem 1.2rem;
  border-left: 3px solid;
  margin-bottom: 0.4rem;
  background: var(--cms-canvas);
  border-radius: 0 4px 4px 0;

  &--error { border-left-color: #c62828; }
  &--warning { border-left-color: #e65100; }
  &--info { border-left-color: var(--cms-ink-muted); }
}

.typography-diagnostics__code {
  font-family: monospace;
  font-size: 1.1rem;
  color: var(--cms-ink-muted);
}

.typography-diagnostics__message {
  font-size: 1.3rem;
  color: #202124;
  line-height: 1.4;
}
</style>
