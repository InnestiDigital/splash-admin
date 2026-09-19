import type { BaseEvent } from '@ag-ui/client';
import type { RunAgentInput } from '@ag-ui/core';
import type { SSEEvent } from '../../protocol/index.js';
import type { openSSE } from '../transport/sse.js';

/**
 * Test seam only: adapts an `openSSE`-shaped scripted transport into the SSE
 * Response the HttpAgent fetch path expects. Scripted fixtures emit bare
 * event sequences, so this shim synthesizes the framing the SDK requires
 * (RUN_STARTED, TEXT_MESSAGE_START/END, TOOL_CALL_END) and journals every
 * synthesized event so the subscriber can drop it before it reaches
 * consumers — production streams never contain these compatibility events.
 * Production never constructs this: `createChat` builds it only when
 * `config.transport` is supplied.
 */
export interface InjectedTransport {
  response(authToken: string, input: RunAgentInput): Promise<Response>;
  /** True when the event was synthesized by the shim and must not be forwarded. */
  consumeHidden(event: BaseEvent): boolean;
}

export function createInjectedTransport(
  transport: typeof openSSE,
  agentUrl: string,
  turnTimeoutMs?: number,
): InjectedTransport {
  const hiddenCompatibilityEvents = new Map<string, number>();

  const hiddenKey = (event: string, id = ''): string => `${event}:${id}`;
  const hide = (event: string, id = ''): void => {
    const key = hiddenKey(event, id);
    hiddenCompatibilityEvents.set(key, (hiddenCompatibilityEvents.get(key) ?? 0) + 1);
  };

  async function response(authToken: string, input: RunAgentInput): Promise<Response> {
    const encoder = new TextEncoder();
    const iterator = transport({
      url: agentUrl,
      input,
      authToken,
      ...(turnTimeoutMs !== undefined ? { timeoutMs: turnTimeoutMs } : {}),
    })[Symbol.asyncIterator]();
    // Pull once before constructing the Response so a scripted HTTP error
    // rejects the SDK run normally instead of becoming an unhandled stream
    // controller rejection.
    const first = await iterator.next();
    const source: SSEEvent[] = [];
    if (!first.done) source.push(first.value);
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      source.push(next.value);
    }
    const runId = `compat-${Date.now()}`;
    const threadId = input.threadId;
    const normalized: SSEEvent[] = [];
    let textId: string | null = null;
    const activeTools = new Set<string>();
    if (source[0]?.event !== 'RUN_STARTED') {
      normalized.push({ event: 'RUN_STARTED', data: '{}' });
      hide('RUN_STARTED');
    }
    for (const event of source) {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      const messageId = typeof data['messageId'] === 'string' ? data['messageId'] : '';
      const toolCallId = typeof data['toolCallId'] === 'string' ? data['toolCallId'] : '';
      if (event.event === 'TEXT_MESSAGE_CONTENT' && textId !== messageId) {
        if (textId) {
          normalized.push({
            event: 'TEXT_MESSAGE_END',
            data: JSON.stringify({ messageId: textId }),
          });
          hide('TEXT_MESSAGE_END', textId);
        }
        textId = messageId;
        normalized.push({
          event: 'TEXT_MESSAGE_START',
          data: JSON.stringify({ messageId, role: 'assistant' }),
        });
        hide('TEXT_MESSAGE_START', messageId);
      }
      if (event.event === 'TOOL_CALL_START') activeTools.add(toolCallId);
      if (event.event === 'TOOL_CALL_END') activeTools.delete(toolCallId);
      if (event.event === 'TOOL_CALL_RESULT' && activeTools.delete(toolCallId)) {
        normalized.push({ event: 'TOOL_CALL_END', data: JSON.stringify({ toolCallId }) });
        hide('TOOL_CALL_END', toolCallId);
      }
      if (event.event === 'RUN_FINISHED') {
        if (textId) {
          normalized.push({
            event: 'TEXT_MESSAGE_END',
            data: JSON.stringify({ messageId: textId }),
          });
          hide('TEXT_MESSAGE_END', textId);
          textId = null;
        }
        for (const id of activeTools) {
          normalized.push({ event: 'TOOL_CALL_END', data: JSON.stringify({ toolCallId: id }) });
          hide('TOOL_CALL_END', id);
        }
        activeTools.clear();
      }
      normalized.push(event);
    }
    const encode = (event: SSEEvent): Uint8Array => {
      const parsed = JSON.parse(event.data) as Record<string, unknown>;
      return encoder.encode(
        `event: ${event.event}\ndata: ${JSON.stringify({
          type: event.event,
          threadId,
          runId,
          ...parsed,
        })}\n\n`,
      );
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const event of normalized) controller.enqueue(encode(event));
          controller.close();
        } catch (cause) {
          controller.error(cause);
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  function consumeHidden(event: BaseEvent): boolean {
    const id =
      'messageId' in event && typeof event.messageId === 'string'
        ? event.messageId
        : 'toolCallId' in event && typeof event.toolCallId === 'string'
          ? event.toolCallId
          : '';
    const key = hiddenKey(event.type, id);
    const count = hiddenCompatibilityEvents.get(key) ?? 0;
    if (count === 0) return false;
    if (count === 1) hiddenCompatibilityEvents.delete(key);
    else hiddenCompatibilityEvents.set(key, count - 1);
    return true;
  }

  return { response, consumeHidden };
}
