import { computed, ref } from 'vue'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import {
  SYSTEM_ROLES,
  type CreatePresetDto,
  type PresetCategory,
  type PresetUsage,
  type SystemRole,
  type TypographyPreset,
  type TypographyRoleMapping,
  type UpdatePresetDto,
} from '~/server/services/typography/typographyTypes'

function getErrorMessage(error: any, fallback: string): string {
  return error?.data?.statusMessage || error?.message || fallback
}

export function useTypographyAdmin() {
  const { siteFetch } = useSiteApi()

  const presets = ref<TypographyPreset[]>([])
  const roles = ref<TypographyRoleMapping[]>([])
  const loadingPresets = ref(false)
  const loadingRoles = ref(false)
  /**
   * Whether `roles` was ever populated FROM THE SERVER. It cannot be derived
   * from the data: `roleMap` enumerates every SYSTEM_ROLE (unmapped ones as
   * null) whether or not a fetch ever ran, and `roles` is legitimately empty on
   * a site that has assigned none — so "the map/list is empty" is never a
   * truthful "not loaded". Callers that PUT the COMPLETE map (`saveRoles`
   * replaces every mapping server-side) need this to tell an unseeded map from
   * a genuinely empty one before merging into it.
   */
  const rolesLoaded = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  const roleMap = computed<Record<SystemRole, string | null>>(() => {
    const next = {} as Record<SystemRole, string | null>
    for (const role of SYSTEM_ROLES) {
      next[role] = roles.value.find(mapping => mapping.role === role)?.presetId ?? null
    }
    return next
  })

  async function fetchPresets(): Promise<void> {
    loadingPresets.value = true
    error.value = null
    try {
      const data = await siteFetch<{ presets: TypographyPreset[] }>('/typography/presets')
      presets.value = data.presets ?? []
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to load typography presets')
    } finally {
      loadingPresets.value = false
    }
  }

  async function fetchRoles(): Promise<void> {
    loadingRoles.value = true
    error.value = null
    try {
      const data = await siteFetch<{ roles: TypographyRoleMapping[] }>('/typography/roles')
      roles.value = data.roles ?? []
      rolesLoaded.value = true
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to load typography roles')
    } finally {
      loadingRoles.value = false
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([fetchPresets(), fetchRoles()])
  }

  async function createPreset(dto: CreatePresetDto): Promise<TypographyPreset> {
    saving.value = true
    error.value = null
    try {
      const data = await siteFetch<{ preset: TypographyPreset }>('/typography/presets', {
        method: 'POST',
        body: dto,
      })
      presets.value = [...presets.value, data.preset]
      return data.preset
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to create typography preset')
      await refresh()
      throw err
    } finally {
      saving.value = false
    }
  }

  /**
   * `dto` widens to a plain record for wire-shaped callers (the assistant's
   * editor-op executor forwards a schema-parsed patch, which is
   * `Record<string, unknown>` and cannot narrow to `UpdatePresetDto` without an
   * assertion). The endpoint validates the patch either way; typed callers keep
   * their compile-time checking by passing an `UpdatePresetDto`.
   */
  async function updatePreset(id: string, dto: UpdatePresetDto | Record<string, unknown>): Promise<void> {
    saving.value = true
    error.value = null
    try {
      const data = await siteFetch<{ preset: TypographyPreset }>(`/typography/presets/${id}`, {
        method: 'PUT',
        body: dto,
      })
      presets.value = presets.value.map(preset => preset.id === id ? data.preset : preset)
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to update typography preset')
      await refresh()
      throw err
    } finally {
      saving.value = false
    }
  }

  async function deletePreset(id: string): Promise<void> {
    saving.value = true
    error.value = null
    try {
      await siteFetch(`/typography/presets/${id}`, { method: 'DELETE' })
      presets.value = presets.value.filter(preset => preset.id !== id)
      roles.value = roles.value.filter(role => role.presetId !== id)
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to delete typography preset')
      await refresh()
      throw err
    } finally {
      saving.value = false
    }
  }

  async function duplicatePreset(id: string, overrides?: { name?: string }): Promise<TypographyPreset> {
    saving.value = true
    error.value = null
    try {
      const data = await siteFetch<{ preset: TypographyPreset }>(`/typography/presets/${id}/duplicate`, {
        method: 'POST',
        body: overrides ?? {},
      })
      presets.value = [...presets.value, data.preset]
      return data.preset
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to duplicate typography preset')
      await refresh()
      throw err
    } finally {
      saving.value = false
    }
  }

  async function reorderPresets(category: PresetCategory, orderedIds: string[]): Promise<void> {
    saving.value = true
    error.value = null

    const originalPresets = presets.value.map(preset => ({ ...preset }))
    const categoryPositionMap = new Map(orderedIds.map((id, index) => [id, index]))

    presets.value = presets.value
      .map((preset) => {
        if (preset.category !== category || !categoryPositionMap.has(preset.id)) return preset
        return { ...preset, position: categoryPositionMap.get(preset.id)! }
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.position - b.position || a.name.localeCompare(b.name))

    try {
      await siteFetch('/typography/presets/reorder', {
        method: 'PUT',
        body: { category, orderedIds },
      })
    } catch (err: any) {
      presets.value = originalPresets
      error.value = getErrorMessage(err, 'Failed to reorder typography presets')
      await refresh()
      throw err
    } finally {
      saving.value = false
    }
  }

  async function fetchPresetUsage(id: string): Promise<PresetUsage> {
    return siteFetch<PresetUsage>(`/typography/presets/${id}/usage`)
  }

  /**
   * PUTs the COMPLETE map — the server replaces every mapping, so a partial map
   * silently clears the roles it omits. Keyed by `string` rather than
   * `SystemRole` so a caller holding a merged wire map (the assistant's
   * editor-op executor) can pass it without an assertion; the server rejects
   * unknown roles, and `roleMap` remains the canonical key set to merge over.
   */
  async function saveRoles(mappings: Record<string, string | null>): Promise<void> {
    saving.value = true
    error.value = null
    try {
      const payload = Object.entries(mappings)
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([role, presetId]) => ({ role, presetId }))

      const data = await siteFetch<{ roles: TypographyRoleMapping[] }>('/typography/roles', {
        method: 'PUT',
        body: { mappings: payload },
      })
      roles.value = data.roles ?? []
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to save typography roles')
      await refresh()
      throw err
    } finally {
      saving.value = false
    }
  }

  async function resetRoles(): Promise<void> {
    saving.value = true
    error.value = null
    try {
      const data = await siteFetch<{ roles: TypographyRoleMapping[] }>('/typography/roles/reset', {
        method: 'POST',
      })
      roles.value = data.roles ?? []
    } catch (err: any) {
      error.value = getErrorMessage(err, 'Failed to reset typography roles')
      await refresh()
      throw err
    } finally {
      saving.value = false
    }
  }

  return {
    presets,
    roles,
    roleMap,
    rolesLoaded,
    loadingPresets,
    loadingRoles,
    saving,
    error,
    fetchPresets,
    fetchRoles,
    refresh,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    reorderPresets,
    fetchPresetUsage,
    saveRoles,
    resetRoles,
  }
}
