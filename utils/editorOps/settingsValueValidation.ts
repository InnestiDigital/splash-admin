// admin/utils/editorOps/settingsValueValidation.ts
//
// Settings-value validation for editor ops (2026-09 assistant quality pass).
//
// The protocol delivers `settings` values as `z.unknown()` and the host gated
// key NAMES only — an op could write `headingLevel: "banana"` into a select
// whose options are 1–6, or `title: <9000 chars>`, and the op reported
// `applied` while the value rendered as nothing or broke the component. This
// module validates the VALUES a schema can judge, and fails OPEN on everything
// it cannot (media fields have their own validation lane; exotic types are the
// renderer's problem) — the same permissive posture `useBlockSettings.validate`
// takes for the human editor.
//
// Pure over (fields, settings): no stores, no DOM, trivially testable.
import { evaluateShowIf } from '~/admin/utils/showIfCondition'

/** The subset of a block-schema field this validator reads. */
export interface ValidatableField {
  id: string
  type?: string
  showIf?: unknown
  options?: unknown
  validation?: { required?: boolean; maxLength?: number } | undefined
  allowedBlocks?: unknown
  maxBlocks?: unknown
  maxItems?: unknown
}

export interface SettingsValueIssue {
  fieldId: string
  message: string
}

/** Field types whose values carry media semantics validated elsewhere. */
const MEDIA_FIELD_TYPES = new Set(['image', 'video', 'image-gallery', 'audio', 'file'])

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Validate one block's settings against its schema fields.
 *
 * `settings` is the map being checked — for `add_block` that is the op's
 * settings, for `update_block_settings` the patch, for `set_block_field` a
 * single-key map. Keys the schema does not declare are reported unless
 * `checkUnknownKeys` is false (the key gate already ran elsewhere).
 */
export function validateSettingValues(
  fields: readonly ValidatableField[] | null | undefined,
  settings: Record<string, unknown>,
  { checkUnknownKeys = false }: { checkUnknownKeys?: boolean } = {},
): SettingsValueIssue[] {
  if (!fields || fields.length === 0) return []
  const issues: SettingsValueIssue[] = []
  const declared = new Set(fields.map(field => field.id))

  if (checkUnknownKeys) {
    for (const key of Object.keys(settings)) {
      if (!declared.has(key)) {
        issues.push({
          fieldId: key,
          message: `"${key}" is not a declared setting — declared: ${[...declared].join(', ')}`,
        })
      }
    }
  }

  for (const field of fields) {
    // A field the author cannot see in this configuration is not one the op
    // should be judged against: its option list may not apply to the merged
    // state, and rejecting on it would block legitimate writes.
    if (!evaluateShowIf(field.showIf as never, settings)) continue

    const value = settings[field.id]
    if (isEmpty(value)) continue
    // Note: `validation.required` is deliberately NOT enforced here. Both ops
    // that consume this validator write partial values — a patch, or an
    // add_block whose omissions the schema defaults fill server-side — and a
    // required field the op did not mention is not a defect. Required-ness is
    // the full-form editor's concern (useBlockSettings.validate).

    if (MEDIA_FIELD_TYPES.has(field.type ?? '')) continue

    if (field.type === 'toggle') {
      if (typeof value !== 'boolean') {
        issues.push({ fieldId: field.id, message: `"${field.id}" is a toggle — expected true or false` })
      }
      continue
    }

    if (field.type === 'select' || field.type === 'radio') {
      const options = field.options
      if (Array.isArray(options) && options.length > 0) {
        const valid = options
          .map(option => (option && typeof option === 'object' ? (option as { value?: unknown }).value : option))
          .filter(option => option !== undefined)
        if (valid.length > 0 && !valid.includes(value)) {
          issues.push({
            fieldId: field.id,
            message: `"${field.id}" must be one of: ${valid.map(String).join(', ')}`,
          })
        }
      }
      continue
    }

    if (field.type === 'range' || field.type === 'number') {
      if (typeof value === 'number' && field.options && typeof field.options === 'object'
        && !Array.isArray(field.options)) {
        const range = field.options as { min?: number; max?: number }
        if (range.min !== undefined && value < range.min) {
          issues.push({ fieldId: field.id, message: `"${field.id}" must be >= ${range.min}` })
        }
        if (range.max !== undefined && value > range.max) {
          issues.push({ fieldId: field.id, message: `"${field.id}" must be <= ${range.max}` })
        }
      }
      continue
    }

    if (field.type === 'blocks') {
      // Children get the same policy the server now enforces at every write
      // boundary — catch it at op time so the model sees the reason.
      const children = Array.isArray(value) ? value : null
      if (!children) {
        issues.push({ fieldId: field.id, message: `"${field.id}" is a block list — expected an array` })
        continue
      }
      if (typeof field.maxBlocks === 'number' && children.length > field.maxBlocks) {
        issues.push({
          fieldId: field.id,
          message: `"${field.id}" accepts at most ${field.maxBlocks} block(s), got ${children.length}`,
        })
      }
      if (Array.isArray(field.allowedBlocks) && field.allowedBlocks.length > 0) {
        const allowed = new Set(field.allowedBlocks as string[])
        for (const child of children) {
          const childType = child && typeof child === 'object' ? (child as { type?: unknown }).type : undefined
          if (typeof childType === 'string' && !allowed.has(childType)) {
            issues.push({
              fieldId: field.id,
              message: `"${field.id}" does not accept block type "${childType}" (allowed: ${field.allowedBlocks.join(', ')})`,
            })
          }
        }
      }
      continue
    }

    if (field.type === 'repeater') {
      if (Array.isArray(value) && typeof field.maxItems === 'number' && value.length > field.maxItems) {
        issues.push({
          fieldId: field.id,
          message: `"${field.id}" accepts at most ${field.maxItems} item(s), got ${value.length}`,
        })
      }
      continue
    }

    if (typeof value === 'string' && field.validation?.maxLength !== undefined
      && value.length > field.validation.maxLength) {
      issues.push({
        fieldId: field.id,
        message: `"${field.id}" exceeds max length of ${field.validation.maxLength}`,
      })
    }
  }

  return issues
}
