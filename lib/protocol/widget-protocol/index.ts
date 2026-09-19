import { z } from 'zod';
import { AdminNavTargetSchema } from '../types/admin-navigation.js';
import { StorefrontIdSchema } from './storefront.js';

export const WIDGET_PROTOCOL_VERSION = 1 as const;

export const WIDGET_MESSAGE_TYPES = [
  'wallet.ready',
  'wallet.init-auth',
  'wallet.auth-success',
  'wallet.auth-error',
  'wallet.resize',
  'wallet.close',
  'wallet.error',
  'wallet.navigate',
  // Iframe→parent cart invalidation. The host never trusts widget cart
  // data; it re-reads its native cart under the existing member session.
  'wallet.cart-changed',
  // Admin navigation directive. Iframe→parent. Carries a CLOSED-ENUM
  // `target` + a stable `navId` — NEVER a path/URL (the closed-set
  // anti-injection guarantee holds end-to-end; the host owns the
  // target→route map). Distinct from `wallet.navigate` (member, path-based).
  'wallet.admin-navigate',
  'wallet.expand',
  'wallet.collapse',
  'wallet.whisper.list',
  'wallet.whisper.click',
  'wallet.whisper.dismiss',
  // Mid-session agent-token re-mint round-trip (iframe cannot mint — no member
  // credential; the parent retains the Podium JWT and mints). The iframe asks,
  // the parent re-mints and delivers a fresh short-lived RS256 agent token, or
  // signals that the re-mint failed (e.g. the Podium session itself is dead).
  'wallet.token-refresh-request',
  'wallet.token-refresh',
  'wallet.token-refresh-failed',
  // Parent→iframe visibility signal. The payload identifies the panel-open
  // occurrence only; host cart/account data never crosses this trust seam.
  'wallet.panel-open',
] as const;

/** Single-sourced from {@link WIDGET_MESSAGE_TYPES} — the allowlist `Set` below derives from the same array. */
export type WidgetMessageType = (typeof WIDGET_MESSAGE_TYPES)[number];

export const AUTH_ERROR_CODES = [
  'TOKEN_MISSING',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'ORIGIN_REJECTED',
  'SESSION_EXPIRED',
  'NETWORK_ERROR',
] as const;

/** Single-sourced from {@link AUTH_ERROR_CODES} — `AuthErrorPayloadSchema.code` derives from the same array. */
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/**
 * Generic postMessage envelope. Deliberately NOT backed by a single runtime
 * zod schema (special case): zod cannot express the `<P = unknown>` type
 * parameter without lossily fixing `P` to `unknown`. Generics are a legitimate
 * exception to the otherwise schema-per-wire-type convention.
 */
export interface WidgetMessage<P = unknown> {
  readonly type: WidgetMessageType;
  readonly v: typeof WIDGET_PROTOCOL_VERSION;
  readonly widgetInstanceId: string;
  readonly payload?: P;
}

export type ReadyPayload = Record<string, never>;
export const InitAuthPayloadSchema = z.object({
  token: z.string(),
});
export type InitAuthPayload = z.infer<typeof InitAuthPayloadSchema>;
export const AuthSuccessPayloadSchema = z.object({
  memberId: z.string(),
});
export type AuthSuccessPayload = z.infer<typeof AuthSuccessPayloadSchema>;
export const AuthErrorPayloadSchema = z.object({
  code: z.enum(AUTH_ERROR_CODES),
  retryable: z.boolean(),
});
export type AuthErrorPayload = z.infer<typeof AuthErrorPayloadSchema>;
export const ResizePayloadSchema = z.object({
  height: z.number(),
});
export type ResizePayload = z.infer<typeof ResizePayloadSchema>;
export type ClosePayload = Record<string, never>;
export const ErrorPayloadSchema = z.object({
  code: z.string(),
  fatal: z.boolean(),
  detail: z.string().optional(),
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
export const NavigatePayloadSchema = z.object({
  /** Relative path to navigate to (e.g. "/shop/xbox-50-gift-card") */
  path: z.string(),
  /** Close the wallet panel after navigation (default: false) */
  closePanel: z.boolean().optional(),
});
export type NavigatePayload = z.infer<typeof NavigatePayloadSchema>;

export const CART_CHANGE_ACTIONS = ['add', 'remove', 'clear', 'promotion'] as const;
export type CartChangeAction = (typeof CART_CHANGE_ACTIONS)[number];

/**
 * `wallet.cart-changed` — invalidation only; no cart data crosses the seam.
 * The optional storefront id tells the host which native store module to
 * refresh and remains advisory until the host/Podium validate it. `action`
 * is low-cardinality analytics context, not cart state; it remains optional
 * so mixed loader/widget deployments preserve the v1 invalidation contract.
 */
export const CartChangedPayloadSchema = z
  .object({
    storefrontId: StorefrontIdSchema.optional(),
    action: z.enum(CART_CHANGE_ACTIONS).optional(),
  })
  .strict();
export type CartChangedPayload = z.infer<typeof CartChangedPayloadSchema>;

/**
 * `wallet.admin-navigate` — iframe→parent admin nav directive. Carries the
 * closed-enum `target` (validated against `AdminNavTargetSchema`) + a stable
 * `navId` the host acks against (act once per new navId). NEVER a path — the
 * host owns the target→Angular-route map. `label` is display-only; the host
 * MUST NOT derive any navigation from it.
 */
export const AdminNavigatePayloadSchema = z.object({
  target: AdminNavTargetSchema,
  navId: z.string().min(1),
  label: z.string().min(1).max(120).optional(),
});
export type AdminNavigatePayload = z.infer<typeof AdminNavigatePayloadSchema>;

/** `wallet.token-refresh-request` — iframe→parent. No payload. */
export type TokenRefreshRequestPayload = Record<string, never>;
/**
 * `wallet.token-refresh` — parent→iframe. Carries a freshly re-minted
 * short-lived RS256 agent token. Mirrors {@link InitAuthPayloadSchema}.
 */
export const TokenRefreshPayloadSchema = z.object({
  token: z.string(),
});
export type TokenRefreshPayload = z.infer<typeof TokenRefreshPayloadSchema>;
/**
 * `wallet.token-refresh-failed` — parent→iframe. The re-mint failed (e.g. the
 * Podium session JWT is gone/expired). The iframe fails the in-flight refresh
 * closed and the chat surfaces a "Session expired" error.
 */
export const TokenRefreshFailedPayloadSchema = z.object({
  reason: z.string().optional(),
});
export type TokenRefreshFailedPayload = z.infer<typeof TokenRefreshFailedPayloadSchema>;

/**
 * `wallet.panel-open` — parent→iframe. Each distinct open gets a stable id so
 * delivery may be repeated across the iframe-ready/auth race without causing
 * duplicate refreshes. This is an invalidation signal, never host state.
 */
export const PanelOpenPayloadSchema = z
  .object({
    openId: z.string().min(1).max(160),
    storefrontId: StorefrontIdSchema.optional(),
  })
  .strict();
export type PanelOpenPayload = z.infer<typeof PanelOpenPayloadSchema>;

export function makeMessage<P>(
  type: WidgetMessageType,
  widgetInstanceId: string,
  payload: P,
): WidgetMessage<P> {
  return { type, v: WIDGET_PROTOCOL_VERSION, widgetInstanceId, payload };
}

export type ExpandPayload = Record<string, never>;
export type CollapsePayload = Record<string, never>;

/**
 * Whisper payload shape used in postMessage envelopes.
 *
 * Structurally compatible with the canonical `Whisper` type
 * (`@agentcore-platform/protocol`, `src/types/whisper.ts`). Defined inline here
 * (not imported) so the postMessage protocol subtree stays self-contained
 * and does not pull in the broader contract type graph. Mirrors every
 * `Whisper` field, including `subject` (always set by `renderWhisper`) and
 * the optional `decorations` sidecar — `useWhispers.ts` forwards the
 * canonical object verbatim (`{ ...toRaw(w) }`) so the payload type must
 * cover it exactly, not just the subset a widget consumer happens to read.
 */
export const WhisperListPayloadSchema = z.object({
  whispers: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum([
          'brand_affinity',
          'category_affinity',
          'promo_group_affinity',
          'deal_expiring_soon',
        ]),
        title: z.string(),
        because: z.string(),
        seedQuery: z.string(),
        subject: z.string(),
        createdAt: z.string(),
        decorations: z
          .array(
            z.object({
              kind: z.literal('promo'),
              groupCode: z.string(),
              groupName: z.string(),
              endDateUtc: z.string().optional(),
              urgencyHours: z.number().optional(),
            }),
          )
          .readonly()
          .optional(),
      }),
    )
    .readonly(),
});
export type WhisperListPayload = z.infer<typeof WhisperListPayloadSchema>;
export const WhisperClickPayloadSchema = z.object({
  whisperId: z.string(),
  seedQuery: z.string(),
});
export type WhisperClickPayload = z.infer<typeof WhisperClickPayloadSchema>;
export const WhisperDismissPayloadSchema = z.object({
  whisperId: z.string(),
});
export type WhisperDismissPayload = z.infer<typeof WhisperDismissPayloadSchema>;

const WIDGET_MESSAGE_TYPE_SET: ReadonlySet<WidgetMessageType> = new Set(WIDGET_MESSAGE_TYPES);

export function isWidgetMessage(data: unknown): data is WidgetMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.type === 'string' &&
    WIDGET_MESSAGE_TYPE_SET.has(d.type as WidgetMessageType) &&
    d.v === WIDGET_PROTOCOL_VERSION &&
    typeof d.widgetInstanceId === 'string'
  );
}

export * from './sse-frame.js';
export * from './widget-state.js';
export * from './plan-state.js';
export * from './prefill-reasoning.js';
export * from './catalog-results.js';
export * from './orders-v2.js';
export * from './product-description.js';
export * from './member-next-action.js';
export * from './storefront.js';
export * from './splash-state.js';
