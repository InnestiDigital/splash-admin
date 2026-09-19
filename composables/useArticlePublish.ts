import { adminFetch } from '~/admin/utils/adminFetch'

/**
 * Per-article publish helpers (Blog-1, Chunk D.4 / Chunk P).
 *
 * These wrap the dedicated `/api/admin/s/:siteId/articles/:articleId/{publish,unpublish}`
 * endpoints so the admin UI never goes through the generic page PUT for status flips.
 * The dedicated endpoints purge cache / config snapshots in a single transaction,
 * so callers must use these helpers for article status changes.
 */

export async function publishArticle(siteId: string, articleId: string): Promise<void> {
  await adminFetch(`/api/admin/s/${siteId}/articles/${articleId}/publish`, { method: 'POST' })
}

export async function unpublishArticle(siteId: string, articleId: string): Promise<void> {
  await adminFetch(`/api/admin/s/${siteId}/articles/${articleId}/unpublish`, { method: 'POST' })
}
