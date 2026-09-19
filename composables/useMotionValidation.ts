import { computed, type Ref } from 'vue'
import type { AnimationScene } from '~/shared/types/animation'
import { validateSceneSet, type ValidationIssue } from '~/shared/features/cms/animation/sceneValidation'

/**
 * Reactive wrapper around scene validation.
 * Re-validates whenever the scenes ref changes.
 */
export function useMotionValidation(scenes: Ref<AnimationScene[]>) {
  const allIssues = computed<ValidationIssue[]>(() => {
    return validateSceneSet(scenes.value)
  })

  function getIssuesForScene(sceneId: string): ValidationIssue[] {
    const scene = scenes.value.find((s) => s.id === sceneId)
    if (!scene) return []
    const entryIds = new Set(scene.entries.map((e) => e.id))
    return allIssues.value.filter((issue) =>
      issue.entryIds.some((id) => entryIds.has(id)),
    )
  }

  function getIssuesForEntry(entryId: string): ValidationIssue[] {
    return allIssues.value.filter((issue) =>
      issue.entryIds.includes(entryId),
    )
  }

  return {
    allIssues,
    getIssuesForScene,
    getIssuesForEntry,
  }
}
