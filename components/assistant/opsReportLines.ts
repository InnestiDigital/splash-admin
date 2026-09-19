import type { SplashEditorOpsReport } from '~/admin/lib/protocol/types/splash-editor-context'

export type OpsReportLineKind = 'warning' | 'applied' | 'failed'

export interface OpsReportLine {
  kind: OpsReportLineKind
  /**
   * The op summary or failure reason, with the "<batchId>:<index> " prefix the
   * report carries for the model stripped. Whether an "Applied:"/"Failed:"
   * label prepends this in the UI is the caller's call, not this function's —
   * the drawer routes that label through i18n, so it is not baked in here.
   */
  text: string
}

/**
 * `report.warnings` is already ranked by `applyEditorOpBatch`'s
 * `historyClearEffect` (a real discriminant on `op.kind`, not prose): a
 * destructive notice first, then the deduped generic history-clear notice,
 * then critical (undo point not recorded / confirmation pending), then per-op
 * chatter — ordered so the cap on that array can only ever evict the most
 * recoverable material. Rendering warnings BEFORE the applied/failed lines
 * carries that ranking into the UI: on a busy batch the one line saying
 * something was destroyed permanently must not sit under a wall of routine
 * "Applied: …" lines.
 *
 * There is no second, text-matching classifier here for what is or isn't
 * undoable — `applyEditorOp.ts`'s summaries are free text (e.g. `Set
 * ${op.fieldPath}` for a `set_block_field` on `layout.columns`) and would give
 * a regex over `applied` entries false positives. The driver already knows
 * the answer from the op kind; this function only renders what it said.
 */
export function formatOpsReport(report: SplashEditorOpsReport | null): OpsReportLine[] {
  if (!report) return []
  return [
    ...(report.warnings ?? []).map(text => ({ kind: 'warning' as const, text })),
    ...report.applied.map(entry => ({ kind: 'applied' as const, text: entry.replace(/^\S+:\d+\s/, '') })),
    ...report.failed.map(f => ({ kind: 'failed' as const, text: f.reason })),
  ]
}
