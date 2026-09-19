import type { SplashPrefill } from '~/admin/lib/protocol/types/splash-prefill'
import { resolveByLabel } from '~/admin/utils/prefill/labelResolution'

export interface ArticlesNewVocab {
  /** Blog-index pages as the wizard fetches them (id + display title). */
  blogs: ReadonlyArray<{ id: string, title: string }>
  /** Templates pre-filtered to appliesTo === 'article' (the wizard's own computed). */
  templates: ReadonlyArray<{ id: string, label: string }>
}
export interface ArticlesNewPatch { blogId?: string, templateId?: string, title?: string }

/** Fail-soft per field: patch what resolves, drop + report the rest, never guess. */
export function applyArticlesNewPrefill(
  prefill: Extract<SplashPrefill, { kind: 'admin-context-articles-new' }>,
  vocab: ArticlesNewVocab,
): { patch: ArticlesNewPatch, applied: string[], dropped: string[] } {
  const patch: ArticlesNewPatch = {}
  const applied: string[] = []
  const dropped: string[] = []

  if (prefill.blogLabel !== undefined) {
    const blog = resolveByLabel(vocab.blogs, prefill.blogLabel, b => b.title)
    if (blog) { patch.blogId = blog.id; applied.push('blog') }
    else dropped.push(`blog "${prefill.blogLabel}"`)
  }
  if (prefill.templateLabel !== undefined) {
    const template = resolveByLabel(vocab.templates, prefill.templateLabel, t => t.label)
    if (template) { patch.templateId = template.id; applied.push('template') }
    else dropped.push(`template "${prefill.templateLabel}"`)
  }
  if (prefill.title !== undefined) { patch.title = prefill.title; applied.push('title') }

  return { patch, applied, dropped }
}
