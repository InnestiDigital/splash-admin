import type { SSEEvent } from '../../protocol/index.js';
import { parseSSEFrame } from '../../protocol/index.js';

/**
 * Async generator that reads raw bytes from an SSE stream reader,
 * buffers partial chunks, splits on double-newline frame boundaries,
 * and yields parsed SSEEvent objects.
 *
 * Calls reader.releaseLock() in a finally block to ensure cleanup
 * on both normal completion and early termination (generator.return()).
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        if (frame.trim().length === 0) continue;

        const event = parseSSEFrame(frame);
        if (event) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
