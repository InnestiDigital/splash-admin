<template>
  <AdminPageHeader
    :title="t('admin.data.title', 'Data connections')"
    :description="t('admin.data.description', 'Configure the external data sources used by this website.')"
    alert-context="api-config"
  />

  <div v-if="store.loading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <template v-else>
    <!-- Embedded ApiConfigPanel -->
    <ApiConfigPanel />
  </template>
</template>

<script setup lang="ts">
import { useAlertStore } from '~/admin/stores/alertStore'
import { useApiConfigStore } from '~/admin/stores/apiConfigStore'
import { useSite } from '~/admin/composables/useSite'
import ApiConfigPanel from '~/admin/components/editor/ApiConfigPanel.vue'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite } = useSite()
const alertStore = useAlertStore()
const store = useApiConfigStore()

onMounted(async () => {
  if (hasSite.value) await store.fetchApiConfig()
})

watch(siteId, (newId) => {
  if (newId) store.fetchApiConfig()
})
</script>
