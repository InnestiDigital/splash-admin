import { SSE_ERROR_CODES } from '../types/error.js';
import type { SSEEvent, SSEPayloadMap } from '../types/sse.js';

/**
 * Parse the JSON data field of an SSEEvent into its typed payload.
 * The frame's `event` field is an open string, so the caller names the
 * expected kind explicitly: `parseSSEData<'done'>(event)`.
 * Returns the typed payload or null if parsing fails.
 */
export function parseSSEData<K extends keyof SSEPayloadMap>(
  event: SSEEvent,
): SSEPayloadMap[K] | null {
  try {
    if (!event.data) {
      return null;
    }
    return JSON.parse(event.data) as SSEPayloadMap[K];
  } catch {
    return null;
  }
}

/**
 * Parse a single SSE frame into an SSEEvent object.
 * Frame format follows SSE spec: lines of "field: value", separated by \n\n
 *
 * @param frame - Raw SSE frame string (without trailing \n\n delimiter)
 * @returns Parsed SSEEvent or null if frame is invalid
 */
export function parseSSEFrame(frame: string): SSEEvent | null {
  const lines = frame.split('\n');
  let eventType = 'message'; // Default per SSE spec
  let data = '';
  let id: string | undefined;

  for (const line of lines) {
    // Ignore comments (lines starting with :)
    if (line.startsWith(':')) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const field = line.substring(0, colonIndex).trim();
    // Value starts after colon, skip leading space if present
    const value = line.substring(colonIndex + 1).trimStart();

    switch (field) {
      case 'event':
        eventType = value;
        break;
      case 'data':
        // Multi-line data fields are concatenated with newlines
        data += (data.length > 0 ? '\n' : '') + value;
        break;
      case 'id':
        id = value;
        break;
      // Ignore other fields (retry, etc.)
    }
  }

  // Validate that we have at least data
  if (data.length === 0) {
    return null;
  }

  // Attempt to validate JSON if data looks like JSON
  if (data.trim().startsWith('{')) {
    try {
      JSON.parse(data);
    } catch {
      // Emit synthetic error event for malformed JSON
      return {
        event: 'error',
        data: JSON.stringify({
          error: 'Malformed SSE data',
          code: SSE_ERROR_CODES.PARSE_ERROR,
          original: data,
        }),
        id,
      };
    }
  }

  return {
    event: eventType,
    data,
    id,
  };
}
