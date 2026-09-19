import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PageSummary, Page } from '~/server/storage/types'

/**
 * Pages list and current page state.
 * Pure state store — all async fetches live in the proxy coordinator (editorStore.ts).
 */
export const usePageStore = defineStore('editor-page', () => {
  const pages = ref<PageSummary[]>([])
  const currentPage = ref<Page | null>(null)

  // ── Computed ──

  const topLevelPages = computed(() => pages.value.filter(p => !p.parentId))

  /**
   * Return the slug of the direct parent page, or null for top-level pages.
   */
  function getParentSlug(page: PageSummary): string | null {
    if (!page.parentId) return null
    return pages.value.find(p => p.id === page.parentId)?.slug ?? null
  }

  /**
   * Walk the full ancestor chain from root to the direct parent of `page`.
   * Returns slugs in root-first order, e.g. ['grandparent', 'parent'].
   * A visited-set guards against cycles.
   */
  function getAncestorSlugs(page: PageSummary): string[] {
    const slugs: string[] = []
    // Seed with the starting page's own id so self-referencing pages are caught immediately
    const visited = new Set<string>([page.id])
    let current: PageSummary | undefined = page
    while (current?.parentId) {
      if (visited.has(current.parentId)) break // cycle guard
      visited.add(current.parentId)
      const parent = pages.value.find(p => p.id === current!.parentId)
      if (!parent) break
      slugs.unshift(parent.slug)
      current = parent
    }
    return slugs
  }

  /**
   * Names of dynamic segments extracted from the full page path (including
   * parent slugs, e.g. ['id'] for 'home/[id]' or a child of a dynamic parent).
   */
  const dynamicSlugParams = computed<string[]>(() => {
    const page = currentPage.value
    if (!page) return []
    const ancestors = getAncestorSlugs(page)
    const fullSlug = [...ancestors, page.slug].join('/')
    const matches = fullSlug.match(/\[([^\]]+)\]/g)
    return matches ? matches.map(m => m.slice(1, -1)) : []
  })

  // ── Setters (called by proxy coordinator) ──

  function setPages(newPages: PageSummary[]) {
    pages.value = newPages
  }

  function setCurrentPage(page: Page | null) {
    currentPage.value = page
  }

  return {
    pages,
    currentPage,
    topLevelPages,
    dynamicSlugParams,
    getParentSlug,
    getAncestorSlugs,
    setPages,
    setCurrentPage,
  }
})
