import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ApiConfig, ApiHeader, ApiRequest, ApiSource } from '~/server/storage/types'
import { useSiteStore } from '~/admin/stores/siteStore'
import { adminFetch } from '~/admin/utils/adminFetch'

export const useApiConfigStore = defineStore('apiConfig', () => {
  const siteStore = useSiteStore()
  const siteId = computed(() => siteStore.activeSiteId)

  // State
  const headers = ref<ApiHeader[]>([])
  const sources = ref<ApiSource[]>([])
  const requests = ref<ApiRequest[]>([])
  const selectedRequestId = ref<string | null>(null)
  const editingHeader = ref<{ index: number; key: string; value: string } | null>(null)
  const editingSource = ref<{ id?: string; name: string; baseUrl: string; color?: string } | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const selectedRequest = computed(() => {
    if (!selectedRequestId.value) return null
    return requests.value.find(r => r.id === selectedRequestId.value) ?? null
  })

  const requestsList = computed(() => requests.value)

  const headerOptions = computed(() => headers.value.map(h => h.key))

  /** Group requests by sourceId. Key is sourceId or '__default__' for unassigned. */
  const requestsBySource = computed(() => {
    const groups: Record<string, ApiRequest[]> = { __default__: [] }
    for (const source of sources.value) {
      groups[source.id] = []
    }
    for (const req of requests.value) {
      const key = req.sourceId && groups[req.sourceId] ? req.sourceId : '__default__'
      groups[key].push(req)
    }
    return groups
  })

  // Actions

  async function fetchApiConfig() {
    if (!siteId.value) return
    loading.value = true
    error.value = null
    try {
      const data = await adminFetch<{ config: ApiConfig | null }>(`${siteStore.apiBase}/api-config`)
      if (data.config) {
        headers.value = data.config.headers || []
        sources.value = data.config.sources || []
        requests.value = data.config.requests || []
      } else {
        headers.value = []
        sources.value = []
        requests.value = []
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch API config'
    } finally {
      loading.value = false
    }
  }

  async function updateConfig(config: Partial<ApiConfig>) {
    if (!siteId.value) return
    saving.value = true
    error.value = null
    try {
      const data = await adminFetch<{ config: ApiConfig }>(`${siteStore.apiBase}/api-config`, {
        method: 'PUT',
        body: {
          headers: config.headers ?? headers.value,
          sources: config.sources ?? sources.value,
          requests: config.requests ?? requests.value,
        },
      })
      headers.value = data.config.headers || []
      sources.value = data.config.sources || []
      requests.value = data.config.requests || []
    } catch (e: any) {
      error.value = e.message || 'Failed to update API config'
    } finally {
      saving.value = false
    }
  }

  // Header inline editing

  function addHeader(header: ApiHeader) {
    headers.value = [...headers.value, header]
  }

  function updateHeader(index: number, header: ApiHeader) {
    const updated = [...headers.value]
    updated[index] = header
    headers.value = updated
  }

  function deleteHeader(index: number) {
    headers.value = headers.value.filter((_, i) => i !== index)
  }

  function startEditingHeader(index: number) {
    const header = headers.value[index]
    if (header) {
      editingHeader.value = { index, key: header.key, value: header.value }
    }
  }

  function cancelEditingHeader() {
    editingHeader.value = null
  }

  function startAddingHeader() {
    editingHeader.value = { index: -1, key: '', value: '' }
  }

  // Source actions

  function addSource(source: Omit<ApiSource, 'id'>) {
    const id = `src-${Date.now()}`
    sources.value = [...sources.value, { id, ...source }]
  }

  function updateSource(id: string, updates: Partial<ApiSource>) {
    const index = sources.value.findIndex(s => s.id === id)
    if (index !== -1) {
      const updated = [...sources.value]
      updated[index] = { ...updated[index], ...updates }
      sources.value = updated
    }
  }

  function deleteSource(id: string) {
    // Unassign requests that reference this source
    requests.value = requests.value.map(r =>
      r.sourceId === id ? { ...r, sourceId: undefined } : r,
    )
    sources.value = sources.value.filter(s => s.id !== id)
  }

  function startEditingSource(source?: ApiSource) {
    if (source) {
      editingSource.value = { id: source.id, name: source.name, baseUrl: source.baseUrl, color: source.color ?? undefined }
    } else {
      editingSource.value = { name: '', baseUrl: '', color: undefined }
    }
  }

  function cancelEditingSource() {
    editingSource.value = null
  }

  function saveEditingSource() {
    if (!editingSource.value) return
    const { id, name, baseUrl, color } = editingSource.value
    if (!name.trim() || !baseUrl.trim()) return

    if (id) {
      updateSource(id, { name: name.trim(), baseUrl: baseUrl.trim(), color })
    } else {
      addSource({ name: name.trim(), baseUrl: baseUrl.trim(), color })
    }
    editingSource.value = null
  }

  // Request actions

  function selectRequest(id: string) {
    selectedRequestId.value = id
  }

  function deselectRequest() {
    selectedRequestId.value = null
  }

  function addRequest(request: ApiRequest) {
    requests.value = [...requests.value, request]
  }

  function updateRequest(id: string, request: ApiRequest) {
    const index = requests.value.findIndex(r => r.id === id)
    if (index !== -1) {
      const updated = [...requests.value]
      updated[index] = request
      requests.value = updated
    }
  }

  function deleteRequest(id: string) {
    requests.value = requests.value.filter(r => r.id !== id)
    if (selectedRequestId.value === id) {
      selectedRequestId.value = null
    }
  }

  function getNewRequestDefaults(): Partial<ApiRequest> {
    return {
      id: '',
      name: '',
      method: 'POST',
      endpoint: '',
      body: {},
      contract: {},
    }
  }

  return {
    // State
    siteId,
    headers,
    sources,
    requests,
    selectedRequestId,
    editingHeader,
    editingSource,
    loading,
    saving,
    error,
    // Computed
    selectedRequest,
    requestsList,
    headerOptions,
    requestsBySource,
    // Actions
    fetchApiConfig,
    updateConfig,
    addHeader,
    updateHeader,
    deleteHeader,
    startEditingHeader,
    cancelEditingHeader,
    startAddingHeader,
    addSource,
    updateSource,
    deleteSource,
    startEditingSource,
    cancelEditingSource,
    saveEditingSource,
    selectRequest,
    deselectRequest,
    addRequest,
    updateRequest,
    deleteRequest,
    getNewRequestDefaults,
  }
})
