import { z } from 'zod';
import { SSE_ERROR_CODES } from './error.js';
import type { WidgetSseFrame } from '../widget-protocol/sse-frame.js';

/**
 * The SSE wire has ONE frame shape — {@link WidgetSseFrame}
 * (`widget-protocol/sse-frame.ts`), a string-keyed `event`/`data` pair.
 * `SSEEvent` is the legacy alias for the same frame: the wire `event` name is
 * an open string (AG-UI frame labels like `STATE_DELTA` plus the in-stream
 * names in {@link SSEPayloadMap}), so consumers narrow it by plain string
 * comparison.
 */
export type SSEEvent = WidgetSseFrame;

// --- SSE data payload types (one per in-stream event name) ---

export const SSEMessagePayloadSchema = z.object({
  text: z.string(),
  messageId: z.string().optional(),
});
export type SSEMessagePayload = z.infer<typeof SSEMessagePayloadSchema>;

export const SSEToolStartPayloadSchema = z.object({
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});
export type SSEToolStartPayload = z.infer<typeof SSEToolStartPayloadSchema>;

export const SSEToolResultPayloadSchema = z.object({
  tool: z.string(),
  result: z.unknown(),
  isError: z.boolean(),
  isPreview: z.boolean().optional(),
  previewContent: z.string().optional(),
  fullContentRef: z.string().optional(),
  originalTokens: z.number().optional(),
});
export type SSEToolResultPayload = z.infer<typeof SSEToolResultPayloadSchema>;

// Local (non-exported) zod shape for the cross-file SSEErrorCode union,
// composed from the SSE_ERROR_CODES const so it stays single-sourced.
const sseErrorCodeShape = z.enum([
  SSE_ERROR_CODES.AGENT_ERROR,
  SSE_ERROR_CODES.PARSE_ERROR,
  SSE_ERROR_CODES.INTERNAL_ERROR,
]);

export const SSEErrorPayloadSchema = z.object({
  error: z.string(),
  code: sseErrorCodeShape,
});
export type SSEErrorPayload = z.infer<typeof SSEErrorPayloadSchema>;

/**
 * Per-turn metrics shape. Exported (with {@link SSEDoneMetrics}) so
 * the runtime's completed-flow projection
 * can reference this type directly for its core fields instead of hand-
 * mirroring the field list — the two shapes are pinned by that shared type
 * reference, not by a "keep these two files in sync" comment.
 */
export const SSEDoneMetricsSchema = z.object({
  toolCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  /**
   * Single source of truth for per-turn cost. Server-side
   * `bedrock-pricing.ts` computes from real token usage + a static
   * list-price table. `estimated: true` flags this as an
   * approximation; the widget renders it as "≈ $0.00xx (list price)"
   * and falls back to tokens-only when these fields are omitted
   * (unknown model, deterministic turn).
   */
  totalTokens: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
  inputCostUsd: z.number().optional(),
  outputCostUsd: z.number().optional(),
  pricingModelKey: z.string().optional(),
  pricingSource: z.string().optional(),
  estimated: z.boolean().optional(),
  // Prompt-cache slice. Omitted on cache-blind turns.
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  cacheReadCostUsd: z.number().optional(),
  cacheWriteCostUsd: z.number().optional(),
  cacheHitRatio: z.number().optional(),
  estimatedSavedUsd: z.number().optional(),
});
export type SSEDoneMetrics = z.infer<typeof SSEDoneMetricsSchema>;

export const SSEDonePayloadSchema = z.object({
  metrics: SSEDoneMetricsSchema.nullable(),
  returnControlRounds: z.number().optional(),
  turnLatencyMs: z.number().optional(),
  confirmationWaitMs: z.number().optional(),
  backend: z.string().optional(),
  agentId: z.string().optional(),
  agentAliasId: z.string().optional(),
});
export type SSEDonePayload = z.infer<typeof SSEDonePayloadSchema>;

export const SSENavigatePayloadSchema = z.object({
  path: z.string(),
  closePanel: z.boolean().optional(),
});
export type SSENavigatePayload = z.infer<typeof SSENavigatePayloadSchema>;

/** Session-expiry payload. `sessionType` is a required field. */
export const SSESessionExpiryPayloadSchema = z.object({
  expiresInSeconds: z.number(),
  sessionType: z.string(),
  canExtend: z.boolean(),
});
export type SSESessionExpiryPayload = z.infer<typeof SSESessionExpiryPayloadSchema>;

// --- Checkout confirmation payload types ---

// Local (non-exported) zod shapes for the NON-boundary checkout supporting
// types, used to compose the boundary schemas below.
const checkoutItemShape = z.object({
  productName: z.string(),
  quantity: z.number(),
  unitPointCost: z.number(),
  productType: z.string().optional(),
});

const checkoutAddressShape = z.object({
  id: z.number(),
  nickname: z.string().optional(),
  city: z.string(),
  region: z.string(),
  country: z.string(),
  postalCode: z.string(),
});

const checkoutPaymentMethodShape = z.object({
  type: z.string(),
  label: z.string(),
});

const checkoutAddressOptionShape = z.object({
  id: z.string(),
  label: z.string(),
  isDefault: z.boolean().optional(),
});

export const SSECheckoutConfirmationPayloadSchema = z.object({
  shoppingCartId: z.string(),
  items: z.array(checkoutItemShape).readonly(),
  totalPoints: z.number(),
  availablePoints: z.number(),
  shippingAddress: checkoutAddressShape.nullable().optional(),
  hasSplitpay: z.boolean(),
  splitpayRate: z.number().optional(),
  paymentMethods: z.array(checkoutPaymentMethodShape).readonly().optional(),
  /**
   * Full sanitized address list for the in-card selector. When present, the
   * card renders a <select> and POSTs the chosen id back as `selectedAddressId`.
   */
  addresses: z.array(checkoutAddressOptionShape).readonly().optional(),
  /**
   * Id of the address the deterministic checkout picked. The card pre-selects
   * this; the user may change it before confirming.
   */
  defaultAddressId: z.string().optional(),
});
export type SSECheckoutConfirmationPayload = z.infer<typeof SSECheckoutConfirmationPayloadSchema>;

export const SSECheckoutConfirmationBridgePayloadSchema =
  SSECheckoutConfirmationPayloadSchema.extend({
    pendingConfirmationId: z.string(),
    confirmationType: z.literal('checkout_confirmation'),
    expiresAt: z.string(),
    serverNow: z.string(),
  });
export type SSECheckoutConfirmationBridgePayload = z.infer<
  typeof SSECheckoutConfirmationBridgePayloadSchema
>;

// --- Checkout progress payload types ---

export const SSECheckoutProgressPayloadSchema = z.object({
  step: z.enum(['validating', 'processing', 'confirmed', 'failed']),
  toolName: z.string(),
  details: z
    .object({
      orderReference: z.string().optional(),
      totalPoints: z.number().optional(),
      errorMessage: z.string().optional(),
    })
    .optional(),
});
export type SSECheckoutProgressPayload = z.infer<typeof SSECheckoutProgressPayloadSchema>;

// --- Payload lookup map (for generic helpers) ---

/**
 * `data` payloads keyed by the in-stream (non-AG-UI) event names. The wire
 * `event` field is an open string, so `parseSSEData` callers name the expected
 * kind explicitly (`parseSSEData<'done'>(event)`).
 */
export interface SSEPayloadMap {
  message: SSEMessagePayload;
  tool_start: SSEToolStartPayload;
  tool_result: SSEToolResultPayload;
  error: SSEErrorPayload;
  done: SSEDonePayload;
  navigate: SSENavigatePayload;
  checkout_confirmation: SSECheckoutConfirmationBridgePayload;
  checkout_progress: SSECheckoutProgressPayload;
  // Emitted after a successful submit_checkout. Carries normalized order id +
  // reference + total points + items count so the widget renders OrderConfirmationCard.
  order_confirmation: SSEOrderConfirmationPayload;
  session_expiry_warning: SSESessionExpiryPayload;
  // Diagnostic trace events emitted only when the request opts into debug mode
  // (`?debug=1` or `X-Debug-Trace: 1`) AND `DEBUG_TRACE_ENABLED=true`. NEVER
  // emitted on production traffic. Carries redacted, structured data only —
  // never raw user prompts, memberId, addresses, or tool inputs.
  debug_trace: SSEDebugTracePayload;
}

export const SSEOrderConfirmationPayloadSchema = z.object({
  orderId: z.string(),
  reference: z.string().optional(),
  status: z.string().optional(),
  totalPoints: z.number().optional(),
  itemsCount: z.number().optional(),
});
export type SSEOrderConfirmationPayload = z.infer<typeof SSEOrderConfirmationPayloadSchema>;

// --- Debug-trace payload ---

/**
 * Diagnostic events emitted under debug mode. Strictly redacted: never carries
 * raw user prompts, memberId, addresses, prices that could reveal order details,
 * or full tool inputs. The `details` bag is bounded to safe primitives (strings,
 * numbers, booleans, null) and the orchestrator MUST sanitize before populating.
 *
 * Stages line up with the orchestrator pipeline:
 *   - route_decision        IntentRouter outcome
 *   - reference_resolver    Pre-route resolver outcome (resolved/ambiguous/none)
 *   - executor_selected     Deterministic vs Strands picked
 *   - tool_gate             Tool about to run (allowed=true) / guard rejected (false)
 *   - confirmation_parked   Turn parked awaiting user confirmation
 *   - confirmation_resumed  Resumed turn started (incl. cached replay)
 *   - done                  Turn rolled up (token counts mirror DonePayload.metrics)
 */
export const DEBUG_TRACE_STAGES = [
  'context_init',
  'route_decision',
  'reference_resolver',
  'executor_selected',
  /**
   * Pending interaction (parked-flow projection) was (possibly) injected into
   * the model's context. Fires only when the session was claimed in
   * `awaiting_confirmation`. Carries `pendingInteractionInjected` (bool),
   * `pendingInteractionChars`, and `pendingInteractionDropReason` when the
   * block was dropped by a guard (no parked record / expired / PII detected).
   */
  'pending_interaction_injected',
  /**
   * An uploaded spreadsheet grid was serialized, redacted, and (possibly)
   * injected into the model's volatile context on an admin turn. Carries
   * `gridContextChars` (rendered char length), `gridTruncated` (whether the
   * char-cap dropped trailing rows), and `gridPreviewed` (whether the
   * over-budget header-anchored preview path ran, naming the read tool the
   * model can page with). Admin flow only.
   */
  'grid_injected',
  'tool_gate',
  'confirmation_parked',
  'confirmation_resumed',
  'done',
] as const;

/** Single-sourced from {@link DEBUG_TRACE_STAGES} — `SSEDebugTracePayloadSchema.stage` derives from the same array. */
export type DebugTraceStage = (typeof DEBUG_TRACE_STAGES)[number];

export type DebugTraceRouteSource =
  | 'regex'
  | 'classifier'
  | 'sticky'
  | 'reference'
  | 'continuity'
  | 'unsupported'
  | 'hint'
  | 'concierge'
  | 'fallback';

export const SSEDebugTracePayloadSchema = z.object({
  stage: z.enum(DEBUG_TRACE_STAGES),
  turnId: z.string(),
  sessionId: z.string().optional(),
  flow: z.string().optional(),
  reason: z.string().optional(),
  routeSource: z
    .enum([
      'regex',
      'classifier',
      'sticky',
      'reference',
      'continuity',
      'unsupported',
      'hint',
      'concierge',
      'fallback',
    ])
    .optional(),
  executorKind: z.enum(['deterministic', 'strands', 'resume', 'continuation']).optional(),
  modelUsed: z.boolean().optional(),
  modelProfile: z.string().optional(),
  toolName: z.string().optional(),
  allowed: z.boolean().optional(),
  contextMessages: z.number().optional(),
  contextToolFacts: z.number().optional(),
  contextChars: z.number().optional(),
  /** grid_injected stage fields. */
  gridContextChars: z.number().optional(),
  gridTruncated: z.boolean().optional(),
  gridPreviewed: z.boolean().optional(),
  /** pending_interaction_injected stage fields. */
  pendingInteractionInjected: z.boolean().optional(),
  pendingInteractionChars: z.number().optional(),
  pendingInteractionDropReason: z
    .enum([
      'no_parked_record',
      'session_not_awaiting',
      'parked_record_expired',
      'pii_detected_in_summary',
    ])
    .nullable()
    .optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  toolCalls: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
  confirmationId: z.string().optional(),
  parked: z.boolean().optional(),
  replayed: z.boolean().optional(),
  latencyMs: z.number().optional(),
  /**
   * `context_init` payload fields. Surfaced at turn start so the visualization
   * can show "this is running on Bedrock AgentCore Runtime / Haiku 4.5 / git X"
   * without leaking secrets. Only public infra labels go here.
   */
  awsRegion: z.string().optional(),
  agentCoreRuntime: z.string().optional(),
  modelInferenceProfile: z.string().optional(),
  redisKeyPrefix: z.string().optional(),
  dataResidencyMode: z.string().optional(),
  gitSha: z.string().optional(),
  containerDigest: z.string().optional(),
  /**
   * On `executor_selected`, why the model was (or wasn't) used. Lets the panel
   * show "deterministic — reason: continuation:proposal" so a viewer
   * understands the path picked.
   */
  decision: z.string().optional(),
  /**
   * On `tool_gate`, which Transport executes the tool.
   * mcp / direct / strands_internal etc.
   */
  transportKind: z.string().optional(),
  /**
   * Bounded extra detail bag. Values must be safe primitives only —
   * never raw prompts, memberId, addresses, or unfiltered tool input.
   */
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .readonly()
    .optional(),
});
export type SSEDebugTracePayload = z.infer<typeof SSEDebugTracePayloadSchema>;
