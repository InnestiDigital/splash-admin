// admin/utils/seoPreview.ts
//
// Pure, DOM-free helpers powering the live SEO preview in SeoPanel.vue.
// Kept out of the component so the length/status logic is unit-testable in CI
// (no happy-dom, no canvas). Pixel-accurate width measurement lives in the
// component; here we classify by character count, the portable proxy every
// SEO tool (Yoast, Webflow, Framer) falls back to.

export type SeoLengthStatus = 'empty' | 'short' | 'good' | 'long'

export interface SeoLengthRule {
  /** Below this the snippet reads thin — nudge to add more. */
  readonly min: number
  /** Above this search engines truncate the snippet. */
  readonly max: number
}

/** Industry-standard character windows for search snippets. */
export const TITLE_RULE: SeoLengthRule = { min: 30, max: 60 }
export const DESCRIPTION_RULE: SeoLengthRule = { min: 70, max: 160 }

/**
 * Classify a snippet field by length against its rule.
 * `empty` is distinct from `short` so the UI can stay neutral before the
 * author starts typing rather than flagging a warning on an untouched field.
 */
export function classifyLength(text: string, rule: SeoLengthRule): SeoLengthStatus {
  const len = text.trim().length
  if (len === 0) return 'empty'
  if (len < rule.min) return 'short'
  if (len > rule.max) return 'long'
  return 'good'
}

/** Human-readable hint for a given status, or null when nothing to say. */
export function statusHint(status: SeoLengthStatus, rule: SeoLengthRule): string | null {
  switch (status) {
    case 'empty':
      return null
    case 'short':
      return `A bit short — aim for ${rule.min}–${rule.max} characters.`
    case 'long':
      return `Too long — search engines truncate past ~${rule.max} characters.`
    case 'good':
      return 'Good length.'
  }
}

/**
 * Truncate the way a search result does: cut on a word boundary near the limit
 * and append an ellipsis. Returns the input untouched when already within range.
 */
export function truncateSnippet(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  const slice = trimmed.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice
  return `${base.trimEnd()}…`
}

/**
 * Build the crumb-style display URL Google renders: host followed by the path
 * segments joined with " › ". Falls back to just the host for the home page.
 */
export function formatDisplayUrl(host: string, path: string): string {
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return cleanHost
  return `${cleanHost} › ${segments.join(' › ')}`
}
