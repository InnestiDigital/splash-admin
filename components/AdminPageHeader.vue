<template>
  <div class="page-header-wrapper">
    <div class="page-header-main">
      <div class="page-header-copy">
        <h1>{{ title }}</h1>
        <p v-if="description" class="page-header-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="page-header-actions">
        <slot name="actions" />
      </div>
    </div>
    <!-- Scoped alerts for this page context -->
    <div v-if="contextAlerts.length > 0" class="page-header-alerts">
      <div
        v-for="alert in contextAlerts"
        :key="alert.id"
        class="cms-alert"
        :class="`cms-alert--${alert.type}`"
      >
        <span class="material-icons-outlined cms-alert-icon">
          {{ alertIcon(alert.type) }}
        </span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ alert.title }}</div>
          <div v-if="alert.description" class="cms-alert-description">{{ alert.description }}</div>
        </div>
        <button
          v-if="alert.showClose !== false"
          type="button"
          class="cms-alert-close"
          aria-label="Dismiss"
          @click="alertStore.dismiss(alert.id)"
        >
          <span class="material-icons-outlined">close</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAlertStore } from '~/admin/stores/alertStore'

const props = defineProps<{
  title: string
  description?: string
  alertContext?: string
}>()

const alertStore = useAlertStore()

const contextAlerts = computed(() => {
  if (!props.alertContext) return alertStore.alerts
  return alertStore.alerts.filter(a => a.context === props.alertContext || !a.context)
})

function alertIcon(type: string): string {
  switch (type) {
    case 'success': return 'check_circle'
    case 'warning': return 'warning'
    case 'danger': return 'error'
    default: return 'info'
  }
}
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.page-header-wrapper {
  display: block;
  margin-bottom: 2.8rem;

  h1 {
    margin: 0;
  }
}

.page-header-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
  padding-bottom: 1.8rem;
  border-bottom: 1px solid $line;
}

.page-header-copy {
  min-width: 0;
}

.page-header-description {
  max-width: 64rem;
  margin: 0.6rem 0 0;
  color: $text-light-color;
  font-size: 1.4rem;
  line-height: 1.5;
}

.page-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.8rem;
  padding-top: 0.2rem;
}

.page-header-alerts {
  margin-top: 1.6rem;
}

@media (max-width: 767px) {
  .page-header-main {
    flex-direction: column;
  }

  .page-header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
