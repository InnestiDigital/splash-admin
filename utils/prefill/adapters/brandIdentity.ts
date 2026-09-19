import type { SplashPrefill } from '~/admin/lib/protocol/types/splash-prefill'
import type { BrandFieldSchema } from '~/shared/types/brand'
import { normalizeLabel, resolveByLabel } from '~/admin/utils/prefill/labelResolution'

type BrandPrefill = Extract<SplashPrefill, { kind: 'admin-context-brand-identity' }>

/** Prefill text keys → identity field ids (1:1 here; kept explicit for greppability). */
const TEXT_FIELD_IDS = ['brandName', 'tagline', 'toneWords', 'doRules', 'dontRules'] as const

/** Prefill *Label keys → select identity field ids. */
const SELECT_FIELDS = [
  ['brandPrimaryLabel', 'brandPrimary'],
  ['brandSecondaryLabel', 'brandSecondary'],
  ['brandSurfaceLabel', 'brandSurface'],
  ['brandOnSurfaceLabel', 'brandOnSurface'],
  ['headlineRoleLabel', 'headlineRole'],
  ['bodyRoleLabel', 'bodyRole'],
] as const

/** Human name for the report: the schema label when known, else a spaced id. */
function reportName(schema: BrandFieldSchema[], fieldId: string): string {
  const field = schema.find(f => f.id === fieldId)
  return normalizeLabel(field?.label ?? fieldId.replace(/([A-Z])/g, ' $1'))
}

/**
 * Fail-soft per field. Select labels resolve against the server-supplied
 * options on each BrandFieldSchema — label → option VALUE (palette role keys /
 * typography role names, never hex: Color Override Freeze respected).
 */
export function applyBrandIdentityPrefill(
  prefill: BrandPrefill,
  schema: BrandFieldSchema[],
): { patch: Partial<Record<string, string>>, applied: string[], dropped: string[] } {
  const patch: Partial<Record<string, string>> = {}
  const applied: string[] = []
  const dropped: string[] = []

  for (const fieldId of TEXT_FIELD_IDS) {
    const value = prefill[fieldId]
    if (value === undefined) continue
    const field = schema.find(f => f.id === fieldId)
    const max = field?.validation?.maxLength
    if (max !== undefined && value.length > max) {
      dropped.push(`${reportName(schema, fieldId)} (too long)`)
      continue
    }
    patch[fieldId] = value
    applied.push(reportName(schema, fieldId))
  }

  for (const [prefillKey, fieldId] of SELECT_FIELDS) {
    const wanted = prefill[prefillKey]
    if (wanted === undefined) continue
    const field = schema.find(f => f.id === fieldId)
    const option = field?.options
      ? resolveByLabel(field.options, wanted, o => o.label)
      : null
    if (option) { patch[fieldId] = option.value; applied.push(reportName(schema, fieldId)) }
    else dropped.push(`${reportName(schema, fieldId)} "${wanted}"`)
  }

  return { patch, applied, dropped }
}
