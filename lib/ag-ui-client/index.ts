// Public barrel for the framework-agnostic wallet adapter over @ag-ui/client.

// Reactive primitive.
export { createObservable, type Observable } from './observable.js';

// Transport foundations.
export { HTTPError } from './transport/http-error.js';
export { type SSETransportRequest } from './transport/sse.js';

// WidgetState reducer.
export { reduceWidget } from './state/reduce.js';

// Product-results timeline — the client-side render source for product cards
// under AG-UI Tool-Based Generative UI. Pure decode + cap of the
// `search_catalog` TOOL_CALL_RESULT plus the versioned persisted shape and the
// storage PORT the host injects (the browser-session adapter lives in the host).
export {
  PRODUCT_TIMELINE_VERSION,
  type ProductResultItem,
  type ProductResultSet,
  type PersistedProductTimeline,
  type TimelineStore,
} from './state/product-results.js';

// The ONE interrupt wire parser. Projector functions + projection types only —
// the card registries (REWARDS_*_CARD_TYPES) stay single-sourced in
// @agentcore-platform/protocol and are deliberately NOT re-exported here
// (mirroring the EMPTY_WIDGET_STATE re-export-only rule below).
export {
  projectInterrupts,
  projectInterruptFromRunFinished,
  type PendingInterruptProjection,
  type InterruptProjectionEvent,
} from './decode/interrupt-projection.js';

// Re-export the empty WidgetState seed from contract so this core's consumers
// get one definition. Re-export ONLY — the canonical shape stays single-sourced
// in @agentcore-platform/protocol (the widget-state drift test pins it); this
// barrel never redeclares it.
export { EMPTY_WIDGET_STATE } from '../protocol/index.js';

// Framework-free turn driver.
export {
  createChat,
  type ChatClient,
  type SessionWarning,
} from './client/turn.js';
