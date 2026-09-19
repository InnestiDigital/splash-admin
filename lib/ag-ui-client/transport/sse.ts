import type { RunAgentInput } from '@ag-ui/core';
import type { SSEEvent } from '../../protocol/index.js';
import { HTTPError } from './http-error.js';
import { parseSSEStream } from './sse-parser.js';

/**
 * AgentCore session-pinning header. The data-plane reads this into
 * `context.sessionId`; the transport copies it from the native AG-UI thread id
 * so the header and request body agree on one session id.
 */
export const AGENTCORE_SESSION_HEADER = 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id' as const;

/** Default request deadline; the caller may override per call. */
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * A request to open an SSE stream against the AgentCore Runtime data-plane.
 *
 * The input is built by the official AG-UI client. This transport only adds
 * AgentCore authentication/session headers, serializes the input, and parses
 * the returned SSE stream.
 */
export interface SSETransportRequest {
  /** Agent base url; the transport POSTs to `${url}/invoke`. */
  readonly url: string;
  /** Native AG-UI input, serialized verbatim. */
  readonly input: RunAgentInput;
  /**
   * Short-lived RS256 agent token. Rides `Authorization: Bearer` and is the
   * sole identity. Required — a missing/empty token throws before any fetch
   * (fail loud, no fallback transport exists).
   */
  readonly authToken: string;
  /** Request deadline in ms; defaults to {@link DEFAULT_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/**
 * Open an SSE stream to the AgentCore Runtime data-plane and yield parsed
 * events.
 *
 * Single error channel: this generator THROWS (rejects) on every failure —
 * there is no parallel onError callback.
 *
 * - A missing `authToken` throws before any fetch.
 * - A non-OK response throws an {@link HTTPError} carrying the status and the
 *   parsed JSON error body when the body was JSON-parseable.
 * - A 200 response that is not a readable `text/event-stream` body throws an
 *   {@link HTTPError} (a proxy's 200 error page must fail, not mis-parse).
 * - The built-in timeout surfaces as the thrown `AbortError`/`TimeoutError`
 *   from `fetch` — never re-wrapped, never swallowed. The caller need not
 *   provide its own deadline.
 */
export async function* openSSE(req: SSETransportRequest): AsyncGenerator<SSEEvent> {
  if (!req.authToken) {
    throw new Error('openSSE: the native transport requires an agent token (authToken)');
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'text/event-stream');
  headers.set('Authorization', `Bearer ${req.authToken}`);
  headers.set(AGENTCORE_SESSION_HEADER, req.input.threadId);

  const response = await fetch(`${req.url}/invoke`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req.input),
    signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new HTTPError(
      `HTTP ${response.status}`,
      response.status,
      await parseErrorBody(response),
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    throw new HTTPError(
      `expected text/event-stream, received '${contentType || 'no content-type'}'`,
      response.status,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new HTTPError('response carried no readable body', response.status);
  }

  yield* parseSSEStream(reader);
}

/** Parse a non-OK response body as JSON; undefined when it is not JSON. */
async function parseErrorBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
