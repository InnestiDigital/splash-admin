import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProgramSummary } from '~/server/storage/types'
import { extractFetchMessage } from '~/admin/utils/fetchError'

const PROGRAM_STORAGE_KEY = 'cms_active_program'

export const useProgramStore = defineStore('program', () => {
  // State
  const activeProgramId = ref<string | null>(null)
  const activeProgramName = ref<string>('')
  const programs = ref<ProgramSummary[]>([])
  const loading = ref(false)
  const initialized = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const hasProgram = computed(() => activeProgramId.value !== null)

  const activeProgram = computed(() =>
    programs.value.find(p => p.id === activeProgramId.value) ?? null,
  )

  // Actions

  function setProgram(program: { id: string; name: string }) {
    activeProgramId.value = program.id
    activeProgramName.value = program.name

    if (import.meta.client) {
      localStorage.setItem(PROGRAM_STORAGE_KEY, JSON.stringify({
        id: program.id,
        name: program.name,
      }))
    }
  }

  /**
   * Adopt a program list resolved elsewhere. Used by the caller-scoped shell
   * bootstrap (`GET /api/admin/me/context`), which reaches the same records
   * through an endpoint the 'client' role is allowed to call — `fetchPrograms`
   * below hits `/api/admin/programs`, which is admin-only.
   */
  function setPrograms(list: ProgramSummary[]) {
    programs.value = list
    initialized.value = true
  }

  async function fetchPrograms() {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<{ programs: ProgramSummary[] }>('/api/admin/programs')
      programs.value = data.programs || []
      initialized.value = true
    } catch (e: unknown) {
      error.value = extractFetchMessage(e, 'Failed to load programs')
      throw e
    } finally {
      loading.value = false
    }
  }

  function restoreFromStorage() {
    if (!import.meta.client) return
    const saved = localStorage.getItem(PROGRAM_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        activeProgramId.value = parsed.id
        activeProgramName.value = parsed.name || ''
      } catch {
        localStorage.removeItem(PROGRAM_STORAGE_KEY)
      }
    }
  }

  function clearProgram() {
    activeProgramId.value = null
    activeProgramName.value = ''
    if (import.meta.client) {
      localStorage.removeItem(PROGRAM_STORAGE_KEY)
    }
  }

  function clearPrograms() {
    programs.value = []
  }

  return {
    // State
    activeProgramId,
    activeProgramName,
    programs,
    loading,
    initialized,
    error,
    // Computed
    hasProgram,
    activeProgram,
    // Actions
    setProgram,
    setPrograms,
    fetchPrograms,
    restoreFromStorage,
    clearProgram,
    clearPrograms,
  }
})
