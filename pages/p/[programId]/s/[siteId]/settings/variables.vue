<template>
  <AdminPageHeader
    :title="t('admin.data.variablesTitle', 'Site variables')"
    :description="t('admin.data.variablesDescription', 'Manage advanced values used by the website and its integrations.')"
    alert-context="env-variables"
  />
  <EnvVariablesPanel />
</template>

<script setup lang="ts">
import { useEnvVariablesStore } from '~/admin/stores/envVariablesStore'
import { useSite } from '~/admin/composables/useSite'
import EnvVariablesPanel from '~/admin/components/editor/EnvVariablesPanel.vue'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite } = useSite()
const store = useEnvVariablesStore()

onMounted(async () => {
  if (hasSite.value) await store.fetchVariables()
})

watch(siteId, (newId) => {
  if (newId) store.fetchVariables()
})
</script>
