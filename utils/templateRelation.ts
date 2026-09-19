/**
 * The page ⇄ template relationship, as the authoring UI has to show it.
 *
 * Two decisions live here, both pure so the Vue surfaces stay dumb:
 *   - which layout the page's template declares, and whether the page has
 *     wandered off it (the Layout select's "(template default)" / "Overridden")
 *   - which authored content fields a template switch would stop rendering
 */
import { getLocalizedLabel } from './labelUtils'

export const TEMPLATE_DEFAULT_SUFFIX = '(template default)'

/** Layout id every page falls back to when it declares none. */
export const FALLBACK_LAYOUT_ID = 'default'

export interface LayoutRelation {
  /** Layout the page actually renders with. */
  effectiveLayoutId: string
  /** Layout the page's template declares, or null when the page has no template. */
  templateLayoutId: string | null
  /** True when the page follows its template's layout. */
  isTemplateDefault: boolean
  /** True when a template exists and the page's layout diverges from it. */
  isOverridden: boolean
}

export function resolveLayoutRelation(
  pageLayout: string | null | undefined,
  templateLayoutId: string | null | undefined,
): LayoutRelation {
  const effectiveLayoutId = pageLayout || FALLBACK_LAYOUT_ID
  const declared = templateLayoutId || null
  return {
    effectiveLayoutId,
    templateLayoutId: declared,
    isTemplateDefault: declared !== null && declared === effectiveLayoutId,
    isOverridden: declared !== null && declared !== effectiveLayoutId,
  }
}

/**
 * Label for one option of a Layout select. The option the page's template
 * declares carries the suffix; everything else keeps its plain label.
 */
export function layoutOptionLabelWithTemplateDefault(
  baseLabel: string,
  optionId: string,
  templateLayoutId: string | null | undefined,
): string {
  if (!templateLayoutId || optionId !== templateLayoutId) return baseLabel
  return `${baseLabel} ${TEMPLATE_DEFAULT_SUFFIX}`
}

export interface TemplateContentField {
  id: string
  label?: string | Record<string, string>
}

export interface UnrenderedField {
  id: string
  label: string
}

/**
 * True when the author actually put something in the field. Empty strings,
 * empty arrays and empty objects are "never filled in", so switching away from
 * a template that declared them loses nothing worth warning about.
 */
function hasAuthoredValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/**
 * Fields the author has filled in that the target template does not declare —
 * the content a switch would stop rendering. The values survive in
 * `contentData` (the endpoint never touches it); they simply stop appearing.
 */
export function unrenderedContentFields(params: {
  currentSchema: readonly TemplateContentField[] | null | undefined
  targetSchema: readonly TemplateContentField[] | null | undefined
  contentData: Record<string, unknown> | null | undefined
  locale?: string
}): UnrenderedField[] {
  const current = Array.isArray(params.currentSchema) ? params.currentSchema : []
  const target = Array.isArray(params.targetSchema) ? params.targetSchema : []
  const content = params.contentData ?? {}
  const targetIds = new Set(target.map(field => field.id))

  const dropped: UnrenderedField[] = []
  for (const field of current) {
    if (!field?.id || targetIds.has(field.id)) continue
    if (!hasAuthoredValue(content[field.id])) continue
    dropped.push({
      id: field.id,
      label: getLocalizedLabel(field.label, params.locale) || field.id,
    })
  }
  return dropped
}
