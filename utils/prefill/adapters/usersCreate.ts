import type { SplashPrefill } from '~/admin/lib/protocol/types/splash-prefill'
import { resolveByLabel } from '~/admin/utils/prefill/labelResolution'

export interface UsersCreateVocab {
  programs: ReadonlyArray<{ id: string, name: string }>
  sites: ReadonlyArray<{ id: string, name: string, programId: string }>
}
export interface UsersCreatePatch {
  email?: string
  firstName?: string
  lastName?: string
  role?: 'admin' | 'editor' | 'viewer' | 'client'
  programId?: string
  siteIds?: string[]
}

/**
 * Fail-soft per field. Synchronous by design: brandPresetLabel is resolved by
 * the PAGE after loadPresetsFor(siteId) — presets are lazy-loaded per site.
 * Password is never prefilled (ruling 7): the human types it.
 */
export function applyUsersCreatePrefill(
  prefill: Extract<SplashPrefill, { kind: 'admin-users' }>,
  vocab: UsersCreateVocab,
): { patch: UsersCreatePatch, applied: string[], dropped: string[] } {
  const patch: UsersCreatePatch = {}
  const applied: string[] = []
  const dropped: string[] = []

  if (prefill.email !== undefined) { patch.email = prefill.email; applied.push('email') }
  if (prefill.firstName !== undefined) { patch.firstName = prefill.firstName; applied.push('first name') }
  if (prefill.lastName !== undefined) { patch.lastName = prefill.lastName; applied.push('last name') }
  if (prefill.role !== undefined) { patch.role = prefill.role; applied.push('role') }

  if (patch.role === 'admin') {
    if (prefill.programLabel !== undefined) dropped.push('program (not applicable for admin)')
    if (prefill.siteLabels !== undefined) dropped.push('sites (not applicable for admin)')
    return { patch, applied, dropped }
  }

  if (prefill.programLabel !== undefined) {
    const program = resolveByLabel(vocab.programs, prefill.programLabel, p => p.name)
    if (program) { patch.programId = program.id; applied.push('program') }
    else dropped.push(`program "${prefill.programLabel}"`)
  }

  if (prefill.siteLabels !== undefined) {
    if (!patch.programId) {
      dropped.push('sites (no resolved program)')
    } else {
      const inProgram = vocab.sites.filter(s => s.programId === patch.programId)
      const resolved: string[] = []
      for (const siteLabel of prefill.siteLabels) {
        const site = resolveByLabel(inProgram, siteLabel, s => s.name)
        if (!site) { dropped.push(`site "${siteLabel}"`); continue }
        if (patch.role === 'client' && resolved.length >= 1) {
          dropped.push(`site "${siteLabel}" (client role allows one site)`)
          continue
        }
        resolved.push(site.id)
      }
      if (resolved.length > 0) { patch.siteIds = resolved; applied.push('sites') }
    }
  }

  return { patch, applied, dropped }
}
