<template>
  <AdminPageHeader
    :title="t('admin.layouts.title', 'Page layout rules')"
    :description="t('admin.layouts.description', 'Choose which page structures are available in the current design.')"
    alert-context="theme-layouts"
  />

  <div v-if="loading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.layouts.loadFailed', 'Failed to load page layouts') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
  </div>

  <div v-else-if="!themeName || layouts.length === 0" class="cms-alert cms-alert--info">
    <span class="material-icons-outlined cms-alert-icon">info</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.layouts.empty', 'No layouts defined') }}</div>
      <div class="cms-alert-description">
        This theme manifest does not declare any layouts under <code>layout.layouts</code>.
      </div>
    </div>
  </div>

  <LayoutsTab
    v-else
    :site-id="siteId"
    :theme-name="themeName"
    :layouts="layouts"
  />
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { computed, ref, watch } from 'vue'
import AdminLayout from '~/admin/components/Layout.vue'
import AdminPageHeader from '~/admin/components/AdminPageHeader.vue'
import LayoutsTab from '~/admin/components/themeEditor/LayoutsTab.vue'
import { useSite } from '~/admin/composables/useSite'
import { useEditorStore } from '~/admin/stores/editorStore'
import type { ThemeLayout } from '~/shared/types/layout'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId } = useSite()
const editorStore = useEditorStore()

const loading = ref(false)
const error = ref<string | null>(null)

const themeManifest = computed<any>(() => editorStore.themeManifest)
const themeName = computed<string>(() => themeManifest.value?.name ?? '')
const layouts = computed<ThemeLayout[]>(
  () => (themeManifest.value?.layout?.layouts ?? []) as ThemeLayout[],
)

watch(
  siteId,
  async (next) => {
    if (!next) return
    loading.value = true
    error.value = null
    try {
      await editorStore.fetchSchemas()
    } catch (err: any) {
      error.value = err?.message ?? 'Failed to load theme'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
</script>
