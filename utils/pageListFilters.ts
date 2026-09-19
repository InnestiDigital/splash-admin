/**
 * Filter helpers for the admin page list (Phase Blog-1 D.1).
 *
 * Filters operate on a `PageSummary[]`-shaped projection. The `static`,
 * `blog-index`, and `article` filters key on `pageType`. The `draft` and
 * `published` filters key on `status`. `all` passes everything through.
 *
 * `noIndex` is intentionally ignored — that flag is SEO-only and must not
 * hide pages from the admin list (carry-forward check #3 from D.1).
 */

export type PageListFilterId =
  | 'all'
  | 'static'
  | 'blog-index'
  | 'article'
  | 'draft'
  | 'published'

export interface PageListFilterOption {
  readonly id: PageListFilterId
  readonly label: string
}

export const PAGE_LIST_FILTERS: readonly PageListFilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'static', label: 'Static' },
  { id: 'blog-index', label: 'Blogs' },
  { id: 'article', label: 'Articles' },
  { id: 'draft', label: 'Drafts' },
  { id: 'published', label: 'Published' },
]

interface FilterablePage {
  readonly pageType?: 'static' | 'blog-index' | 'article'
  readonly status?: 'draft' | 'published'
}

/**
 * Pure filter — given a list of pages and a filter id, return the matching
 * subset. Pages with missing `pageType` are treated as `static` (the default
 * for legacy rows pre-Blog-1 migration).
 */
export function filterPagesForList<T extends FilterablePage>(
  pages: readonly T[],
  filter: PageListFilterId,
): T[] {
  if (filter === 'all') return [...pages]

  if (filter === 'static' || filter === 'blog-index' || filter === 'article') {
    return pages.filter(p => (p.pageType ?? 'static') === filter)
  }

  // status filter — 'draft' or 'published'
  return pages.filter(p => (p.status ?? 'draft') === filter)
}

export function pageTypeLabel(pageType: 'static' | 'blog-index' | 'article' | undefined): string {
  switch (pageType) {
    case 'blog-index': return 'Blog'
    case 'article': return 'Article'
    case 'static':
    default: return 'Static'
  }
}
