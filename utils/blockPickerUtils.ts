/**
 * Block picker grouping utilities.
 *
 * Groups compatible blocks by `category` for optgroup-based rendering
 * in the admin section settings block picker dropdown.
 */

import type { BlockSchema } from '~/server/storage/types'

/** Category display order for grouped block picker */
export const CATEGORY_ORDER = ['editorial', 'content', 'media', 'cta', 'navigation', 'utility'] as const

/** Human-readable labels for block categories */
export const CATEGORY_LABELS: Record<string, string> = {
  editorial: 'Editorial Blocks',
  content: 'Content Blocks',
  media: 'Media & Gallery',
  cta: 'Call-to-Action',
  navigation: 'Navigation',
  utility: 'Utility',
}

export type BlockPickerEntry = {
  type: string
  label: string
  description?: string
}

export type BlockPickerGroup = {
  category: string | null
  label: string
  blocks: BlockPickerEntry[]
}

/** Format a category key into a display label */
export function formatCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1)
}

/** Resolve localized description to a plain string */
export function resolveDescription(desc: unknown): string | undefined {
  if (!desc) return undefined
  if (typeof desc === 'string') return desc
  if (typeof desc === 'object' && desc !== null) {
    return (desc as Record<string, string>)['en-US'] || (desc as Record<string, string>)['en'] || undefined
  }
  return undefined
}

/**
 * Get block types compatible with a given layout role, grouped by category.
 *
 * Returns an array of groups sorted by `CATEGORY_ORDER`, with blocks sorted
 * alphabetically within each group. Blocks without a `category` field are
 * placed in a trailing "Other Blocks" group.
 */
export function groupBlocksByCategory(
  schemas: Record<string, BlockSchema>,
  role: string,
): BlockPickerGroup[] {
  const grouped = new Map<string | null, BlockPickerEntry[]>()

  for (const [blockType, schema] of Object.entries(schemas)) {
    const compatible: string[] = schema.compatibleSectionRoles ?? []
    if (!compatible.includes(role)) continue

    const label = typeof schema.label === 'string' ? schema.label : schema.label?.['en-US'] || blockType
    const description = resolveDescription(schema.description)
    const category: string | null = schema.category ?? null

    if (!grouped.has(category)) grouped.set(category, [])
    grouped.get(category)!.push({ type: blockType, label, description })
  }

  // Sort blocks within each group alphabetically
  for (const blocks of grouped.values()) {
    blocks.sort((a, b) => a.label.localeCompare(b.label))
  }

  const result: BlockPickerGroup[] = []

  // Categorized groups first, in defined order
  for (const cat of CATEGORY_ORDER) {
    if (grouped.has(cat)) {
      result.push({ category: cat, label: formatCategoryLabel(cat), blocks: grouped.get(cat)! })
    }
  }

  // Uncategorized blocks last
  if (grouped.has(null)) {
    result.push({ category: null, label: 'Other Blocks', blocks: grouped.get(null)! })
  }

  return result
}
