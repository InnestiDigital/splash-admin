/**
 * Block role context utilities.
 *
 * Provides contextual messaging for blocks that cannot be assigned
 * a layout role in their current section type. Replaces the opaque
 * "Default only" label with scenario-specific guidance.
 */

import type { BlockSchema } from '~/server/storage/types'
import type { SectionTypeSchema } from '~/shared/types/sectionTypes'
import { resolveDescription } from './blockPickerUtils'

export type BlockRoleScenario =
  | 'layout-component'   // isLayoutComponent flag (Header, Footer, etc.)
  | 'no-roles-described' // No roles but has a schema description
  | 'incompatible'       // Has roles, but none match current section type
  | 'no-roles'           // Generic fallback — no roles, no description

export interface BlockRoleContext {
  scenario: BlockRoleScenario
  message: string
  /** Schema description when available (tooltip content) */
  description?: string
  /** Section types where this block's roles WOULD be compatible */
  alternateSectionTypes?: { type: string; label: string }[]
}

/**
 * Determine contextual info for why a block cannot be assigned a role.
 *
 * Called when `getCompatibleRoles()` returns empty for an unassigned block
 * within a section that has layout slots.
 *
 * Pure function — all dependencies injected for testability.
 */
export function getBlockRoleContext(
  blockSchema: BlockSchema | null,
  currentSectionType: string,
  allSectionSchemas: Record<string, SectionTypeSchema>,
): BlockRoleContext {
  if (!blockSchema) {
    return { scenario: 'no-roles', message: 'Renders below the layout.' }
  }

  // Layout components (Header, Footer, etc.) render outside section flow
  if (blockSchema.isLayoutComponent) {
    return {
      scenario: 'layout-component',
      message: 'Layout component — renders outside section flow.',
    }
  }

  const compatibleRoles: string[] = blockSchema.compatibleSectionRoles ?? []

  // Block declares roles but none match current section type's slots
  if (compatibleRoles.length > 0) {
    const alternates: { type: string; label: string }[] = []

    for (const [type, schema] of Object.entries(allSectionSchemas)) {
      if (type === currentSectionType) continue
      const slotRoles = (schema.layoutSlots ?? []).map(s => s.role)
      if (compatibleRoles.some(r => slotRoles.includes(r))) {
        alternates.push({ type, label: schema.label })
      }
    }

    if (alternates.length > 0) {
      const names = alternates.map(a => a.label).join(', ')
      return {
        scenario: 'incompatible',
        message: `Supports roles in ${names}. Consider switching section type.`,
        alternateSectionTypes: alternates,
      }
    }
  }

  // No roles at all — check for schema description (e.g. HeroBlock)
  const desc = resolveDescription(blockSchema.description)
  if (desc) {
    return {
      scenario: 'no-roles-described',
      message: 'Renders below the layout.',
      description: desc,
    }
  }

  // Generic fallback
  return { scenario: 'no-roles', message: 'Renders below the layout.' }
}
