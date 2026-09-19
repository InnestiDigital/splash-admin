<template>
  <AdminPageHeader
    :title="t('admin.brand.settingsTitle', 'Brand settings')"
    :description="t('admin.brand.settingsDescription', 'Define the approved logos, colors, and voice used to create brand assets.')"
    alert-context="brand-identity"
  />
  <BrandIdentityPanel />
</template>

<script setup lang="ts">
import { useBrandIdentityStore } from '~/admin/stores/brandIdentityStore'
import { useSite } from '~/admin/composables/useSite'
import BrandIdentityPanel from '~/admin/components/editor/BrandIdentityPanel.vue'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAssistantPrefillStore } from '~/admin/stores/assistantPrefillStore'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite } = useSite()
const store = useBrandIdentityStore()
const prefillStore = useAssistantPrefillStore()

function handOffPrefill() {
  const prefill = prefillStore.consume('admin-context-brand-identity')
  if (prefill) store.pendingPrefill = prefill
}

onMounted(async () => {
  if (hasSite.value) {
    await store.bootstrap()
    handOffPrefill()
  }
})

watch(siteId, (newId) => {
  if (newId) store.bootstrap()
})

watch(() => prefillStore.stagedKind, (kind) => {
  // Same-route stage: the page is already mounted and bootstrapped.
  if (kind === 'admin-context-brand-identity' && !store.loading) handOffPrefill()
})
</script>
