// SPLASH VENDOR EDIT: WidgetState re-pointed to SplashWidgetState (see admin/lib/README.md)
// Single pure, framework-agnostic WidgetState reducer.
//
// The reducer receives and returns PLAIN objects. The host (Vue, Angular, a
// test) unwraps any reactivity BEFORE calling and re-wraps the result; the
// reducer itself never touches a framework API.
//
// `fast-json-patch` ships as CJS; default-import + destructure to stay
// compatible with strict ESM (Node runtime, Nuxt prerender).
import jsonpatch, { type Operation } from 'fast-json-patch';
import type { SSEEvent } from '../../protocol/index.js';
import type { SplashWidgetState as WidgetState } from '../../protocol/widget-protocol/splash-state.js';

const { applyPatch } = jsonpatch;

/**
 * Fold an SSE frame into the next `WidgetState`, or `null` to drop it.
 *
 * The wire `event` name carries an AG-UI frame label (`STATE_SNAPSHOT` /
 * `STATE_DELTA` / a text or tool frame). We compare it as a string and ignore
 * everything that is not a state frame.
 *
 * Drop semantics — the single contract every caller relies on (`if (!next)
 * return`):
 *   - non-STATE frame                                  → null
 *   - unparseable frame data                           → null
 *   - STATE_SNAPSHOT with a non-object `snapshot`       → null
 *   - STATE_SNAPSHOT with an object `snapshot`          → that object, UNCLONED
 *   - STATE_DELTA with a non-array `delta`              → null
 *   - STATE_DELTA whose patch fails to apply            → null
 *   - STATE_DELTA with a valid patch                    → structuredClone(prev)
 *                                                          with the patch applied
 *
 * A bad patch is never re-thrown past this boundary: `applyPatch` (validate
 * off) throws on an unreachable path, which we catch and convert to the `null`
 * drop signal so the caller resyncs on the next snapshot.
 */
export function reduceWidget(prev: WidgetState, event: SSEEvent): WidgetState | null {
  const name = event.event;
  if (name !== 'STATE_SNAPSHOT' && name !== 'STATE_DELTA') return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(event.data) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (name === 'STATE_SNAPSHOT') {
    const snapshot = parsed['snapshot'];
    if (snapshot && typeof snapshot === 'object') {
      return snapshot as WidgetState;
    }
    return null;
  }

  // STATE_DELTA — apply RFC 6902 ops on a deep clone so the prev object is
  // never mutated in place. A non-array delta is a malformed frame: drop it.
  const ops = parsed['delta'];
  if (!Array.isArray(ops)) return null;
  const next = structuredClone(prev) as WidgetState;
  try {
    applyPatch(next, ops as Operation[], /* validate */ false);
    return next;
  } catch {
    return null;
  }
}
