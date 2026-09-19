/**
 * Exact-normalized label matching for assistant prefill (spec §4.3). The model
 * copies labels verbatim from read tools; the only tolerated variance is
 * whitespace and case. NEVER fuzzy (podium doctrine, pitfall 10): a wrong
 * silent match is worse than a dropped field the user can see reported.
 */
export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Unique normalized exact match; missing or ambiguous → null (drop + report). */
export function resolveByLabel<T>(
  items: readonly T[],
  label: string,
  getLabel: (item: T) => string,
): T | null {
  const target = normalizeLabel(label)
  const matches = items.filter(item => normalizeLabel(getLabel(item)) === target)
  return matches.length === 1 ? matches[0]! : null
}
