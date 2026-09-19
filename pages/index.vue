<template>
  <AdminPageHeader title="Opening your workspace" alert-context="dashboard" />

  <div class="dashboard-placeholder" aria-live="polite">
    <span class="cms-spinner" />
    <p>Loading your website…</p>
  </div>
</template>

<script setup lang="ts">
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'

definePageMeta({ layout: 'admin' })

const programStore = useProgramStore()
const siteStore = useSiteStore()
const { adminUrl } = useAdminUrl()

/**
 * If the user lands on /admin with no program/site context in the URL,
 * restore from localStorage and redirect to the full context URL.
 * This ensures bookmarked /admin still works but the URL gets upgraded.
 */
onMounted(() => {
  programStore.restoreFromStorage()
  siteStore.restoreFromStorage()
})

watch(
  [() => programStore.activeProgramId, () => siteStore.activeSiteId],
  ([programId, siteId]) => {
    if (programId && siteId) {
      navigateTo(adminUrl('/'), { replace: true })
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.dashboard-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6rem 2rem;
  color: var(--cms-ink-subtle);
}

.dashboard-placeholder p {
  font-size: 1.4rem;
  margin: 0;
}
</style>
