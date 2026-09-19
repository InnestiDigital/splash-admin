import type { SplashPrefill } from '~/admin/lib/protocol/types/splash-prefill'
import { resolveByLabel } from '~/admin/utils/prefill/labelResolution'

export interface PagesCreateVocab {
  pages: ReadonlyArray<{
    id: string
    pageType?: string
    parentId?: string | null
    title?: Record<string, string>
    slug: string
  }>
  templates: ReadonlyArray<{ id: string, label: string, appliesTo: string }>
}
export interface PagesCreatePatch {
  pageType?: 'static' | 'blog-index' | 'article'
  parentId?: string
  templateId?: string
  titleEnUS?: string
}

const pageLabel = (p: PagesCreateVocab['pages'][number]) =>
  p.title?.['en-US'] || p.title?.['en-CA'] || p.slug

/**
 * Fail-soft per field. Resolution runs against the EFFECTIVE page type
 * (prefilled, else the form's current one) using the same eligibility rules
 * as the modal's availableParents / availableTemplates computeds. NO slug —
 * the form derives it from the title (slugManuallyEdited untouched).
 */
export function applyPagesCreatePrefill(
  prefill: Extract<SplashPrefill, { kind: 'admin-context-pages' }>,
  vocab: PagesCreateVocab,
  currentPageType: 'static' | 'blog-index' | 'article',
): { patch: PagesCreatePatch, applied: string[], dropped: string[] } {
  const patch: PagesCreatePatch = {}
  const applied: string[] = []
  const dropped: string[] = []

  const effectiveType = prefill.pageType ?? currentPageType
  if (prefill.pageType !== undefined) { patch.pageType = prefill.pageType; applied.push('page type') }

  if (prefill.parentLabel !== undefined) {
    const candidates = effectiveType === 'article'
      ? vocab.pages.filter(p => p.pageType === 'blog-index')
      : vocab.pages.filter(p => !p.parentId && p.pageType !== 'article')
    const parent = resolveByLabel(candidates, prefill.parentLabel, pageLabel)
    if (parent) { patch.parentId = parent.id; applied.push('parent') }
    else dropped.push(`parent "${prefill.parentLabel}"`)
  }

  if (prefill.templateLabel !== undefined) {
    const candidates = vocab.templates.filter(t => t.appliesTo === effectiveType)
    const template = resolveByLabel(candidates, prefill.templateLabel, t => t.label)
    if (template) { patch.templateId = template.id; applied.push('template') }
    else dropped.push(`template "${prefill.templateLabel}"`)
  }

  if (prefill.title !== undefined) { patch.titleEnUS = prefill.title; applied.push('title') }

  return { patch, applied, dropped }
}
