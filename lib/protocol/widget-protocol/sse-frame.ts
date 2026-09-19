/**
 * The single SSE wire frame shape. One frame == one `event:`/`data:` pair on
 * the wire. The AG-UI framer in `ag-ui/framer.ts` emits frames in this shape
 * via the serializer; clients decode it via `parseSSEFrame`. `event` is an
 * open string — AG-UI frame labels (`STATE_DELTA`, `RUN_FINISHED`, …) plus
 * the in-stream names keyed by `SSEPayloadMap` — narrowed by plain string
 * comparison. Also exported as the legacy alias `SSEEvent` (`types/sse.ts`).
 */
export interface WidgetSseFrame {
  readonly event: string;
  readonly data: string;
  readonly id?: string;
}
