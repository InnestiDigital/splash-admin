/**
 * Top-level page/article media columns (`featured_image_id`, `og_image_id`) are
 * varchar(36) MEDIA IDS. The read paths resolve them through the site's media
 * map (`articlesService`, `seoService`), so a raw URL stored there resolves to
 * nothing — the image simply never renders.
 *
 * Those fields used to be freeform text inputs, so such values exist in the
 * wild. This predicate is what lets the editor say so out loud instead of
 * showing an empty field.
 */
export function isLegacyMediaUrl(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')
}
