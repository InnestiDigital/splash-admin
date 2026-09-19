/**
 * Conditional-visibility engine for the admin block-settings editor.
 *
 * Drives `showIf` (field visible?) and `dependsOn` (field enabled?) on block
 * schema fields, plus `showIf` on settings groups. Pure and framework-free so it
 * can be unit-tested and reused wherever conditional field logic is needed.
 *
 * BACKWARD COMPATIBLE with the two legacy shapes that theme schemas already use:
 *
 *   1. Operator form ...... { "id": "layout", "equals": "row" }
 *                           (also accepts `field` as an alias for `id`)
 *   2. Implicit-AND map ... { "cardStyle": "card", "captionOverlay": true }
 *                           (every entry must match; array = one-of, bool = truthiness)
 *
 * and EXTENDS them with:
 *
 *   • Operators — equals/eq, notEquals/ne, in, notIn, gt, gte, lt, lte,
 *     truthy, falsy, empty, notEmpty. Inline ({ id, gt: 0 }) or explicit
 *     ({ id, op: "gt", value: 0 }).
 *   • Combinators — allOf (AND), anyOf (OR), not (negation), nestable to any depth.
 *
 * The upgrade is a strict superset: every previously-valid condition evaluates
 * identically. It also fixes a latent bug where the operator form only honoured
 * `id` — `{ "field": "x", "equals": "y" }` was silently always-false.
 */

export type ShowIfOperator =
  | 'equals'
  | 'eq'
  | 'notEquals'
  | 'ne'
  | 'in'
  | 'notIn'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'truthy'
  | 'falsy'
  | 'empty'
  | 'notEmpty'

/** A single comparison against one sibling field's current value. */
export interface ShowIfComparison {
  /** Field id to read (preferred). */
  id?: string
  /** Alias for `id`. */
  field?: string
  /** Explicit operator form: `{ id: "n", op: "gt", value: 0 }`. */
  op?: ShowIfOperator
  value?: unknown
  /** Inline-operator form: any ONE of these keys, e.g. `{ id: "n", gt: 0 }`. */
  equals?: unknown
  eq?: unknown
  notEquals?: unknown
  ne?: unknown
  in?: unknown[]
  notIn?: unknown[]
  gt?: number | string
  gte?: number | string
  lt?: number | string
  lte?: number | string
  truthy?: unknown
  falsy?: unknown
  empty?: unknown
  notEmpty?: unknown
}

/** Boolean combinators — each entry is itself a full condition. */
export interface ShowIfCombinator {
  allOf?: ShowIfCondition[]
  anyOf?: ShowIfCondition[]
  not?: ShowIfCondition
}

/** Implicit-AND map: `Record<fieldId, expected>`; every entry must match. */
export type ShowIfMap = Record<string, unknown>

export type ShowIfCondition = ShowIfComparison | ShowIfCombinator | ShowIfMap

/** Inline-operator keys, checked in order (first present wins). */
const INLINE_OPERATORS: ShowIfOperator[] = [
  'equals',
  'eq',
  'notEquals',
  'ne',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'truthy',
  'falsy',
  'empty',
  'notEmpty',
]

function toNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  return false
}

function applyOperator(op: ShowIfOperator, current: unknown, expected: unknown): boolean {
  switch (op) {
    case 'equals':
    case 'eq':
      return Array.isArray(expected) ? expected.includes(current) : current === expected
    case 'notEquals':
    case 'ne':
      return Array.isArray(expected) ? !expected.includes(current) : current !== expected
    case 'in':
      return Array.isArray(expected) && expected.includes(current)
    case 'notIn':
      return Array.isArray(expected) ? !expected.includes(current) : true
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toNumber(current)
      const b = toNumber(expected)
      if (a === null || b === null) return false
      if (op === 'gt') return a > b
      if (op === 'gte') return a >= b
      if (op === 'lt') return a < b
      return a <= b
    }
    case 'truthy':
      return !!current
    case 'falsy':
      return !current
    case 'empty':
      return isEmptyValue(current)
    case 'notEmpty':
      return !isEmptyValue(current)
    default:
      return false
  }
}

/**
 * Evaluate a `showIf` / `dependsOn` condition against the current field values.
 * Returns `true` (visible/enabled) when there is no condition.
 */
export function evaluateShowIf(
  condition: ShowIfCondition | undefined | null,
  values: Record<string, unknown>,
): boolean {
  if (condition === undefined || condition === null || typeof condition !== 'object') {
    return true
  }

  const cond = condition as Record<string, unknown>

  // 1. Combinators (recursive). Only trigger on the correct shape so a real
  //    field literally named allOf/anyOf/not in the map form is never hijacked.
  if (Array.isArray(cond.allOf)) {
    return (cond.allOf as ShowIfCondition[]).every(c => evaluateShowIf(c, values))
  }
  if (Array.isArray(cond.anyOf)) {
    return (cond.anyOf as ShowIfCondition[]).some(c => evaluateShowIf(c, values))
  }
  if (cond.not !== undefined && cond.not !== null && typeof cond.not === 'object') {
    return !evaluateShowIf(cond.not as ShowIfCondition, values)
  }

  // 2. Operator form — { id | field: "x", <op>: value }. Only when an operator
  //    is actually present, so a bare { id: "x" } falls through to legacy map
  //    handling (matching the original behaviour exactly).
  const fieldRef =
    typeof cond.id === 'string' ? cond.id : typeof cond.field === 'string' ? cond.field : null
  if (fieldRef !== null) {
    const current = values[fieldRef]
    if (typeof cond.op === 'string') {
      return applyOperator(cond.op as ShowIfOperator, current, cond.value)
    }
    const inlineOp = INLINE_OPERATORS.find(op => op in cond)
    if (inlineOp) {
      return applyOperator(inlineOp, current, cond[inlineOp])
    }
    // No operator → fall through to the map handling below.
  }

  // 3. Implicit-AND map — every entry must match.
  for (const [fieldId, expected] of Object.entries(cond)) {
    const current = values[fieldId]
    if (Array.isArray(expected)) {
      if (!expected.includes(current)) return false
    } else if (expected === true) {
      if (!current) return false
    } else if (expected === false) {
      if (current) return false
    } else if (current !== expected) {
      return false
    }
  }
  return true
}
