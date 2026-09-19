import type { SplashPrefill } from '~/admin/lib/protocol/types/splash-prefill'
import { resolveByLabel } from '~/admin/utils/prefill/labelResolution'

export interface BlogsNewVocab {
  /** Templates pre-filtered to appliesTo === 'blog-index' (the wizard's own computed). */
  templates: ReadonlyArray<{ id: string, label: string }>
}
export interface BlogsNewPatch { templateId?: string, title?: string }

/** Fail-soft per field: patch what resolves, drop + report the rest, never guess. */
export function applyBlogsNewPrefill(
  prefill: Extract<SplashPrefill, { kind: 'admin-context-blogs-new' }>,
  vocab: BlogsNewVocab,
): { patch: BlogsNewPatch, applied: string[], dropped: string[] } {
  const patch: BlogsNewPatch = {}
  const applied: string[] = []
  const dropped: string[] = []

  if (prefill.templateLabel !== undefined) {
    const template = resolveByLabel(vocab.templates, prefill.templateLabel, t => t.label)
    if (template) { patch.templateId = template.id; applied.push('template') }
    else dropped.push(`template "${prefill.templateLabel}"`)
  }
  if (prefill.title !== undefined) { patch.title = prefill.title; applied.push('title') }

  return { patch, applied, dropped }
}
