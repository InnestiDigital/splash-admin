import type { Block } from '~/server/storage/types'

/**
 * Replace only a block's draft settings while preserving its identity,
 * placement, section, and any other state owned by independent editor lanes.
 */
export function previewBlockSettingsInState(
  blocks: Block[],
  blockId: string,
  settings: Record<string, any>,
): boolean {
  const index = blocks.findIndex(block => block.id === blockId)
  const current = index >= 0 ? blocks[index] : undefined
  if (!current) return false

  blocks[index] = {
    ...current,
    settings: JSON.parse(JSON.stringify(settings)),
  }
  return true
}
