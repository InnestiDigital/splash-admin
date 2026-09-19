import type { SSEEvent } from '../../protocol/index.js';

// Pure, tool-aware AG-UI frame decoder. Maps a raw SSE event into the
// `DecodedFrame` discriminated union. No side effects; no framework APIs.
//
// Never throws on malformed input — a body that fails to JSON.parse drops to
// `{ kind: 'ignored' }`. STATE_* frames pass through as `{ kind: 'state' }`
// WITHOUT being parsed; the WidgetState reducer owns that body's drop decision.

// ── Wire event-name string literals ──
//
// Hand-authored on purpose. The names match what the server framer emits
// and what the decoder below branches on.
//
// The ag-ui core EventType enum is deliberately NOT pulled in: it is a value
// enum that drags a conflicting zod into this framework-agnostic core. The
// names are stable wire strings, so a local const map is the single source of
// truth here. The wire `event` name is an open string (the contract's frame is
// string-keyed), so every comparison against these constants is a plain
// string compare.

const AG_UI_TEXT_MESSAGE_CONTENT = 'TEXT_MESSAGE_CONTENT';
const AG_UI_TOOL_CALL_START = 'TOOL_CALL_START';
const AG_UI_TOOL_CALL_ARGS = 'TOOL_CALL_ARGS';
const AG_UI_TOOL_CALL_END = 'TOOL_CALL_END';
const AG_UI_TOOL_CALL_RESULT = 'TOOL_CALL_RESULT';
const AG_UI_RUN_ERROR = 'RUN_ERROR';
const AG_UI_RUN_FINISHED = 'RUN_FINISHED';
const AG_UI_CUSTOM = 'CUSTOM';
const AG_UI_STATE_SNAPSHOT = 'STATE_SNAPSHOT';
const AG_UI_STATE_DELTA = 'STATE_DELTA';

/**
 * Lowercase in-stream error frame. NOT an AG-UI protocol event: the
 * runtime adapter + agentcore-start emit `event:'error'` for invocation
 * rejections and confirmation-resolve failures (collapsed JSON
 * envelopes). Decoded as run-error so failures are never silently
 * swallowed (which would leave the stream stuck busy).
 */
const SSE_STREAM_ERROR = 'error';

// ── DecodedFrame union ──
//
// The five non-tool kinds are text-delta, run-error, run-finished,
// session-warning, ignored. On top of those:
//   - `state` — a passthrough for STATE_SNAPSHOT / STATE_DELTA. The decoder
//     does NOT parse the state body; it hands the raw event to the WidgetState
//     reducer (`reduceWidget`), which owns the drop decision.
//   - the four populated tool kinds — tool-call-start / -args / -end / -result.
//     Consumed via `isToolBoundary` (bubble-sealing) and by the turn driver,
//     which correlates the `search_catalog` START name → id and decodes its
//     RESULT into the `productResults` timeline.

/** Result of decoding a single AG-UI SSE event. */
export type DecodedFrame =
  | { kind: 'text-delta'; delta: string; messageId: string | null }
  | { kind: 'run-error'; code?: string; message?: string; status?: number; raw: string }
  | { kind: 'run-finished' }
  | { kind: 'session-warning'; expiresInSeconds: number; canExtend: boolean }
  | { kind: 'ignored' }
  // ── State passthrough (reducer owns the body) ──
  | { kind: 'state'; event: SSEEvent }
  // ── Populated tool kinds ──
  | { kind: 'tool-call-start'; toolCallId: string; toolCallName: string }
  | { kind: 'tool-call-args'; toolCallId: string; delta: string }
  | { kind: 'tool-call-end'; toolCallId: string }
  | {
      kind: 'tool-call-result';
      toolCallId: string;
      messageId: string | null;
      content: string | undefined;
    };

/** The four tool kinds, folded to a single boundary by {@link isToolBoundary}. */
export type ToolBoundaryFrame = Extract<
  DecodedFrame,
  { kind: 'tool-call-start' | 'tool-call-args' | 'tool-call-end' | 'tool-call-result' }
>;

/**
 * Fold the four tool kinds to a single boundary (seal the in-flight assistant
 * bubble). A type guard: returns `true` for any tool-call-* frame (narrowing it
 * to {@link ToolBoundaryFrame}), `false` for every other kind. Consumers branch
 * on the guard, NOT on a tool-call-* discriminant — the one exception is the
 * turn driver's sanctioned product-results wire-up.
 */
export function isToolBoundary(frame: DecodedFrame): frame is ToolBoundaryFrame {
  switch (frame.kind) {
    case 'tool-call-start':
    case 'tool-call-args':
    case 'tool-call-end':
    case 'tool-call-result':
      return true;
    default:
      return false;
  }
}

// The finite set of event names this decoder acts on. The wire `event` field
// is a broad string, so we first narrow it to this union (or `null` for an
// unhandled name), then `switch` exhaustively with a `never` default — the
// compiler fails the build if a new member is added here without a matching arm.
type DecodableName =
  | typeof AG_UI_TEXT_MESSAGE_CONTENT
  | typeof AG_UI_TOOL_CALL_START
  | typeof AG_UI_TOOL_CALL_ARGS
  | typeof AG_UI_TOOL_CALL_END
  | typeof AG_UI_TOOL_CALL_RESULT
  | typeof AG_UI_RUN_ERROR
  | typeof AG_UI_RUN_FINISHED
  | typeof AG_UI_CUSTOM
  | typeof AG_UI_STATE_SNAPSHOT
  | typeof AG_UI_STATE_DELTA
  | typeof SSE_STREAM_ERROR;

const DECODABLE_NAMES: ReadonlySet<string> = new Set<DecodableName>([
  AG_UI_TEXT_MESSAGE_CONTENT,
  AG_UI_TOOL_CALL_START,
  AG_UI_TOOL_CALL_ARGS,
  AG_UI_TOOL_CALL_END,
  AG_UI_TOOL_CALL_RESULT,
  AG_UI_RUN_ERROR,
  AG_UI_RUN_FINISHED,
  AG_UI_CUSTOM,
  AG_UI_STATE_SNAPSHOT,
  AG_UI_STATE_DELTA,
  SSE_STREAM_ERROR,
]);

function asDecodableName(name: string): DecodableName | null {
  return DECODABLE_NAMES.has(name) ? (name as DecodableName) : null;
}

/** Tolerant JSON parse — returns `null` instead of throwing on bad input. */
function parseObject(data: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Decode an AG-UI SSE event into a structured `DecodedFrame`. Returns
 * `{ kind: 'ignored' }` for events the chat pipeline does not act on directly
 * (callers still forward them to subscribers).
 */
export function decodeFrame(event: SSEEvent): DecodedFrame {
  const name = asDecodableName(event.event);
  if (name === null) return { kind: 'ignored' };

  switch (name) {
    case AG_UI_TEXT_MESSAGE_CONTENT: {
      const p = parseObject(event.data);
      if (!p) return { kind: 'ignored' };
      return {
        kind: 'text-delta',
        delta: asString(p['delta']) ?? '',
        messageId: asString(p['messageId']),
      };
    }

    case AG_UI_TOOL_CALL_START: {
      const p = parseObject(event.data);
      if (!p) return { kind: 'ignored' };
      const toolCallId = asString(p['toolCallId']) ?? '';
      // Name falls back to the id when absent.
      const toolCallName = asString(p['toolCallName']) ?? toolCallId;
      return { kind: 'tool-call-start', toolCallId, toolCallName };
    }

    case AG_UI_TOOL_CALL_ARGS: {
      const p = parseObject(event.data);
      if (!p) return { kind: 'ignored' };
      return {
        kind: 'tool-call-args',
        toolCallId: asString(p['toolCallId']) ?? '',
        delta: asString(p['delta']) ?? '',
      };
    }

    case AG_UI_TOOL_CALL_END: {
      const p = parseObject(event.data);
      if (!p) return { kind: 'ignored' };
      return { kind: 'tool-call-end', toolCallId: asString(p['toolCallId']) ?? '' };
    }

    case AG_UI_TOOL_CALL_RESULT: {
      const p = parseObject(event.data);
      if (!p) return { kind: 'ignored' };
      const content = asString(p['content']);
      return {
        kind: 'tool-call-result',
        toolCallId: asString(p['toolCallId']) ?? '',
        messageId: asString(p['messageId']),
        // `undefined` (not null) to match `content?: string`.
        content: content ?? undefined,
      };
    }

    case AG_UI_RUN_ERROR: {
      const p = parseObject(event.data);
      if (!p) return { kind: 'run-error', raw: event.data };
      const code = asString(p['code']) ?? undefined;
      const message = asString(p['message']) ?? undefined;
      return { kind: 'run-error', code, message, raw: event.data };
    }

    case AG_UI_RUN_FINISHED:
      return { kind: 'run-finished' };

    case AG_UI_CUSTOM: {
      const p = parseObject(event.data);
      if (!p) return { kind: 'ignored' };
      const value = p['value'];
      if (p['name'] === 'session_expiry_warning' && value && typeof value === 'object') {
        const v = value as Record<string, unknown>;
        const expiresInSeconds =
          typeof v['expiresInSeconds'] === 'number' ? v['expiresInSeconds'] : 0;
        return {
          kind: 'session-warning',
          expiresInSeconds,
          canExtend: v['canExtend'] === true,
        };
      }
      return { kind: 'ignored' };
    }

    case AG_UI_STATE_SNAPSHOT:
    case AG_UI_STATE_DELTA:
      // The decoder never parses the state body — it hands the raw event to
      // the WidgetState reducer, which owns the drop decision.
      return { kind: 'state', event };

    case SSE_STREAM_ERROR: {
      // Tolerant decode — producer payloads differ per site
      // ({code,message} | {code,expected,received} | {...body,status}).
      const p = parseObject(event.data);
      if (!p) return { kind: 'run-error', raw: event.data };
      return {
        kind: 'run-error',
        code: asString(p['code']) ?? undefined,
        message: asString(p['message']) ?? undefined,
        status: typeof p['status'] === 'number' ? p['status'] : undefined,
        raw: event.data,
      };
    }

    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}
