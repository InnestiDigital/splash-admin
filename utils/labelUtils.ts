/**
 * Centralized label localization utilities.
 * Used across all admin editor components.
 */

type LocaleValue = string | TipTapLikeDoc
type LocaleMap = { [locale: string]: LocaleValue } | LocaleValue | null | undefined

interface TipTapLikeDoc {
  type?: string
  content?: Array<{ type?: string; text?: string; content?: any }>
  text?: string
}

const DEFAULT_LOCALE = 'en-US'

/**
 * Walk a TipTap doc and concatenate text nodes into a plain string.
 * Used so block-card titles and other label surfaces can read a richtext
 * field value (post-Phase-2) without leaking JSON via Vue's
 * toDisplayString (which JSON.stringify's plain objects).
 */
function tipTapToPlainText(doc: TipTapLikeDoc | null | undefined): string {
  if (!doc || typeof doc !== 'object') return ''
  if (typeof doc.text === 'string') return doc.text
  if (!Array.isArray(doc.content)) return ''
  let out = ''
  for (const node of doc.content) {
    out += tipTapToPlainText(node)
  }
  return out
}

function coerceToString(value: LocaleValue | undefined | null): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  // TipTap doc shape — extract plain text instead of letting Vue stringify
  // the whole JSON tree into the label slot.
  if (typeof value === 'object' && (value.type === 'doc' || Array.isArray(value.content))) {
    return tipTapToPlainText(value)
  }
  return ''
}

export function getLocalizedLabel(label: LocaleMap, locale: string = DEFAULT_LOCALE): string {
  if (!label) return ''
  if (typeof label === 'string') return label
  // TipTap doc passed directly (non-translatable richtext field)
  if (typeof label === 'object' && (label as TipTapLikeDoc).type === 'doc') {
    return tipTapToPlainText(label as TipTapLikeDoc)
  }
  // Locale map — pick by locale, then default, then first.
  const map = label as { [k: string]: LocaleValue }
  return coerceToString(map[locale]) || coerceToString(map[DEFAULT_LOCALE]) || coerceToString(Object.values(map)[0])
}

export function getFieldLabel(field: { label?: LocaleMap }, locale: string = DEFAULT_LOCALE): string {
  return getLocalizedLabel(field?.label, locale)
}

export function getOptionLabel(option: { label?: LocaleMap; value?: string } | string, locale: string = DEFAULT_LOCALE): string {
  if (!option) return ''
  if (typeof option === 'string') return option
  return getLocalizedLabel(option.label, locale) || option.value || ''
}

export function getGroupLabel(group: { id?: string; label?: LocaleMap }, locale: string = DEFAULT_LOCALE): string {
  if (!group) return ''
  return getLocalizedLabel(group.label, locale) || group.id || ''
}

export function getSchemaLabel(schema: { label?: LocaleMap; type?: string } | null, locale: string = DEFAULT_LOCALE): string {
  if (!schema) return ''
  return getLocalizedLabel(schema.label, locale) || schema.type || ''
}

/**
 * Resolves display label for a block preset.
 * Handles the three historic patterns:
 *   A) { label: { "en-US": "..." } }  — Footer/Header
 *   B) { name: { "en-US": "..." } }   — most standalone blocks
 *   C) { name: "..." }                — plain string (legacy headless)
 */
export function getPresetLabel(preset: { name?: LocaleMap; label?: LocaleMap } | null, locale: string = DEFAULT_LOCALE): string {
  if (!preset) return ''
  return getLocalizedLabel(preset.name, locale) || getLocalizedLabel(preset.label, locale) || ''
}

/**
 * Resolves description for a block preset (optional field).
 * Returns empty string when description is absent.
 */
export function getPresetDescription(preset: { description?: LocaleMap } | null, locale: string = DEFAULT_LOCALE): string {
  if (!preset?.description) return ''
  return getLocalizedLabel(preset.description, locale)
}
