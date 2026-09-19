import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import type { ThemeEnvVariableDef } from '~/server/storage/types'

export const useEnvVariablesStore = defineStore('envVariables', () => {
  const siteStore = useSiteStore()
  const siteId = computed(() => siteStore.activeSiteId)

  // State
  const variables = ref<Record<string, string>>({})
  const definitions = ref<Record<string, ThemeEnvVariableDef>>({})
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function fetchVariables() {
    if (!siteId.value) return
    loading.value = true
    error.value = null
    try {
      const data = await adminFetch<{
        variables: Record<string, string>
        definitions: Record<string, ThemeEnvVariableDef>
      }>(
        `${siteStore.apiBase}/env-variables`,
      )
      variables.value = data.variables ?? {}
      definitions.value = data.definitions ?? {}
    } catch (e: any) {
      error.value = e.message || 'Failed to load env variables'
    } finally {
      loading.value = false
    }
  }

  async function saveVariables(vars: Record<string, string>) {
    if (!siteId.value) return
    saving.value = true
    error.value = null
    try {
      const data = await adminFetch<{ variables: Record<string, string> }>(
        `${siteStore.apiBase}/env-variables`,
        { method: 'PUT', body: { variables: vars } },
      )
      variables.value = data.variables ?? {}
    } catch (e: any) {
      error.value = e.message || 'Failed to save env variables'
    } finally {
      saving.value = false
    }
  }

  return {
    siteId,
    variables,
    definitions,
    loading,
    saving,
    error,
    fetchVariables,
    saveVariables,
  }
})
