import type { AnimationScene, AnimationEntry } from '~/shared/types/animation'
import { getChannelsForPreset } from '~/shared/features/cms/animation/sceneValidation'

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export interface ChoreographyTemplate {
  id: string
  name: string
  baseWidth: number
  baseStep: number
  presetId: string
}

export const CHOREOGRAPHY_TEMPLATES: ChoreographyTemplate[] = [
  { id: 'stagger-in', name: 'Stagger In', baseWidth: 0.30, baseStep: 0.15, presetId: 'fade-up' },
  { id: 'cascade-reveal', name: 'Cascade Reveal', baseWidth: 0.40, baseStep: 0.10, presetId: 'scroll-reveal' },
  { id: 'overlap-fade', name: 'Overlap Fade', baseWidth: 0.60, baseStep: 0.10, presetId: 'fade-through' },
]

// ---------------------------------------------------------------------------
// Range normalization
// ---------------------------------------------------------------------------

/**
 * Compute scroll sub-ranges for `n` blocks using a sliding-window model.
 *
 * Each block gets a window of width `baseWidth` starting at `i * baseStep`.
 * If the last window exceeds 1.0, all values are compressed proportionally.
 * Results are clamped to [0, 1].
 */
export function normalizeRanges(
  n: number,
  baseWidth: number,
  baseStep: number,
): Array<{ start: number; end: number }> {
  if (n <= 0) return []

  const lastEnd = (n - 1) * baseStep + baseWidth
  const scale = lastEnd > 1 ? 1 / lastEnd : 1

  const ranges: Array<{ start: number; end: number }> = []
  for (let i = 0; i < n; i++) {
    const rawStart = i * baseStep * scale
    const rawEnd = (i * baseStep + baseWidth) * scale
    ranges.push({
      start: Math.max(0, Math.min(1, rawStart)),
      end: Math.max(0, Math.min(1, rawEnd)),
    })
  }
  return ranges
}

// ---------------------------------------------------------------------------
// Eligible block filtering
// ---------------------------------------------------------------------------

export interface BlockCandidate {
  id: string
  type: string
  motionSupport?: { levels?: string[]; excluded?: string[] }
}

export interface EligibilityResult {
  id: string
  type: string
  eligible: boolean
  reason?: string
}

/**
 * Determine which section blocks can participate in a choreography.
 *
 * A block is ineligible when:
 * - It has no `motionSupport` (block doesn't opt into motion)
 * - It already has a local scroll scene on root whose preset channels
 *   overlap with the choreography preset's channels
 */
export function getEligibleBlocks(
  sectionBlocks: BlockCandidate[],
  existingScenes: AnimationScene[],
  presetId: string,
): EligibilityResult[] {
  const choreographyChannels = getChannelsForPreset(presetId)

  return sectionBlocks.map((block) => {
    // No motion support → ineligible
    if (!block.motionSupport) {
      return { id: block.id, type: block.type, eligible: false, reason: 'Block does not support motion' }
    }

    // Check for conflicting local scroll scenes on root
    const conflicting = existingScenes.some((scene) => {
      if (scene.trigger.type !== 'scroll') return false
      // Scene must target this block on root
      return scene.entries.some((entry) => {
        if (entry.target.entityType !== 'block') return false
        if (entry.target.entityId !== block.id) return false
        if (entry.target.part !== 'root') return false
        if (!entry.presetId) return false
        const entryChannels = getChannelsForPreset(entry.presetId)
        // Overlap check
        return entryChannels.some((ch) => choreographyChannels.includes(ch))
      })
    })

    if (conflicting) {
      return {
        id: block.id,
        type: block.type,
        eligible: false,
        reason: 'Conflicting local scroll motion on root',
      }
    }

    return { id: block.id, type: block.type, eligible: true }
  })
}

// ---------------------------------------------------------------------------
// Template entry generation
// ---------------------------------------------------------------------------

let entryCounter = 0

/**
 * Generate AnimationEntry objects from a choreography template.
 *
 * Each eligible block gets one entry with the template's preset and a
 * normalized scroll sub-range.
 */
export function generateTemplateEntries(
  templateId: string,
  eligibleBlockIds: string[],
  sceneId: string,
): AnimationEntry[] {
  const template = CHOREOGRAPHY_TEMPLATES.find((t) => t.id === templateId)
  if (!template) {
    throw new Error(`Unknown choreography template: ${templateId}`)
  }

  if (eligibleBlockIds.length === 0) return []

  const ranges = normalizeRanges(eligibleBlockIds.length, template.baseWidth, template.baseStep)

  return eligibleBlockIds.map((blockId, i) => {
    entryCounter++
    return {
      id: `choreo-entry-${blockId}-${entryCounter}`,
      sceneId,
      target: { entityType: 'block' as const, entityId: blockId, part: 'root' },
      keyframes: [{ offset: 0 }, { offset: 1 }],
      position: { type: 'absolute' as const, ms: 0 },
      presetId: template.presetId,
      scrollRange: ranges[i],
    }
  })
}
