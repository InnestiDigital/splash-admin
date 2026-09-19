import type { AnimationScene, ValidationIssue } from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LOOP_PRESET_IDS = ['float', 'swing', 'breathe', 'pulse'] as const

export type TriggerType = 'entrance' | 'hover' | 'scroll' | 'loop'
export type StatusChip = 'conflict' | 'disabled' | 'custom' | 'valid'

const ALL_TRIGGER_TYPES: TriggerType[] = ['entrance', 'hover', 'scroll', 'loop']

// ---------------------------------------------------------------------------
// getTriggerType — derive a human-friendly trigger category from a scene
// ---------------------------------------------------------------------------

export function getTriggerType(scene: AnimationScene): TriggerType {
  const { trigger } = scene

  if (trigger.type === 'scroll') return 'scroll'

  if (trigger.type === 'event') {
    return trigger.event === 'hover' ? 'hover' : 'entrance'
  }

  // intersection — check if any entry uses a loop preset
  if (trigger.type === 'intersection') {
    const hasLoop = scene.entries.some(
      (e) => e.presetId && (LOOP_PRESET_IDS as readonly string[]).includes(e.presetId),
    )
    return hasLoop ? 'loop' : 'entrance'
  }

  return 'entrance'
}

// ---------------------------------------------------------------------------
// getStatusChip — priority: conflict > disabled > custom > valid
// ---------------------------------------------------------------------------

export function getStatusChip(scene: AnimationScene, validationIssues: ValidationIssue[]): StatusChip {
  // Conflict: any error-level issue whose entryIds overlap with this scene's entries
  const sceneEntryIds = new Set(scene.entries.map((e) => e.id))
  const hasConflict = validationIssues.some(
    (issue) => issue.level === 'error' && issue.entryIds.some((id) => sceneEntryIds.has(id)),
  )
  if (hasConflict) return 'conflict'

  if (scene.disabled) return 'disabled'

  // Custom: at least one entry has no presetId (hand-crafted keyframes)
  const hasCustom = scene.entries.some((e) => !e.presetId)
  if (hasCustom) return 'custom'

  return 'valid'
}

// ---------------------------------------------------------------------------
// getAvailableTypes — which trigger types can still be added for a block
// ---------------------------------------------------------------------------

export function getAvailableTypes(
  scenes: AnimationScene[],
  blockId: string,
  targetParts: string[],
): TriggerType[] {
  return ALL_TRIGGER_TYPES.filter((type) => {
    // A type is available if at least one target part is NOT already occupied by that type
    const occupiedParts = getOccupiedParts(scenes, blockId, type)
    return targetParts.some((part) => !occupiedParts.has(part))
  })
}

// ---------------------------------------------------------------------------
// getAvailableTargets — which target parts are free for a given trigger type
// ---------------------------------------------------------------------------

export function getAvailableTargets(
  scenes: AnimationScene[],
  blockId: string,
  triggerType: TriggerType,
  targetParts: string[],
): string[] {
  const occupied = getOccupiedParts(scenes, blockId, triggerType)
  return targetParts.filter((part) => !occupied.has(part))
}

// ---------------------------------------------------------------------------
// Internal: collect parts occupied by a trigger type for a given block
// ---------------------------------------------------------------------------

function getOccupiedParts(
  scenes: AnimationScene[],
  blockId: string,
  triggerType: TriggerType,
): Set<string> {
  const occupied = new Set<string>()
  for (const scene of scenes) {
    if (getTriggerType(scene) !== triggerType) continue
    for (const entry of scene.entries) {
      if (entry.target.entityType === 'block' && entry.target.entityId === blockId) {
        occupied.add(entry.target.part)
      }
    }
  }
  return occupied
}
