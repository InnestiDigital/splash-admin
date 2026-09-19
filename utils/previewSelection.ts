/**
 * Pure selection plumbing for the editor ↔ preview bridge.
 *
 * Both directions of selection sync run through here so the decisions are
 * testable without an iframe: which id the editor pushes to the preview, and
 * which entity a click reported by the preview resolves to.
 */

/** What a preview-reported id turned out to be. */
export type PreviewClickTarget =
  | { kind: 'block', id: string }
  | { kind: 'section', id: string }

/**
 * The one id the preview should highlight and scroll to.
 *
 * A block selection wins over a section selection: selecting a block implies
 * its section, and highlighting both would draw two nested outlines. Returning
 * a single value keeps this a one-source-of-truth decision rather than two
 * watchers racing to post conflicting SECTION_SELECT messages.
 */
export function resolvePreviewSelectionId(
  selectedBlockId: string | null | undefined,
  selectedSectionId: string | null | undefined,
): string | null {
  return selectedBlockId || selectedSectionId || null
}

/**
 * Resolve an id reported by the preview iframe against ids the editor actually
 * knows about.
 *
 * The iframe is a message source, not an authority: the id crosses a
 * postMessage boundary, so it is matched against the loaded blocks and sections
 * before any inspector changes. An id in neither set returns null and the
 * caller does nothing — this is also why the legacy wire name (`SECTION_CLICKED`
 * carries block ids too) cannot mis-route section chrome onto a nonexistent
 * block.
 *
 * Blocks are checked first: a block id and a section id never collide in
 * practice, but a block is the more specific entity, so it wins if they ever do.
 */
export function resolvePreviewClickTarget(
  reportedId: unknown,
  knownBlockIds: Iterable<string>,
  knownSectionIds: Iterable<string>,
): PreviewClickTarget | null {
  if (typeof reportedId !== 'string' || reportedId === '') return null
  for (const id of knownBlockIds) {
    if (id === reportedId) return { kind: 'block', id: reportedId }
  }
  for (const id of knownSectionIds) {
    if (id === reportedId) return { kind: 'section', id: reportedId }
  }
  return null
}
