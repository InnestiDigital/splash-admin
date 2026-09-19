/**
 * Normalized orders slice (v2).
 *
 * The single normalized shape intended to eventually replace the three
 * overlapping legacy order slices (`lastOrder`, `orderStatus`, `recentOrders`):
 * one order-status vocabulary, one row shape, one server-stamped `observedAt`.
 * Wired into `WidgetStateSchema` as the additive, optional `ordersV2` slice
 * (roadmap B1) — a snapshot that omits the key still parses (defaults to null),
 * so pre-B1 payloads remain valid.
 *
 * `OrderStatusV2Schema` is the SINGLE status vocabulary for both an order and
 * its line items (`unknown` is the forward-compatible catch-all).
 *
 * A host-action refresh (roadmap B2) stamps the `readModel` marker onto this
 * slice: which closed refresh action produced the observation and
 * whether all of its reads completed.
 */
import { z } from 'zod';
import { StorefrontIdSchema } from './storefront.js';

export const ORDER_STATUSES_V2 = [
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
  'unknown',
] as const;

export const OrderStatusV2Schema = z.enum(ORDER_STATUSES_V2);
export type OrderStatusV2 = z.infer<typeof OrderStatusV2Schema>;

/** Per-line-item status row. */
export const OrderItemStatusV2Schema = z
  .object({
    itemId: z.string(),
    status: OrderStatusV2Schema,
    productName: z.string().optional(),
    quantity: z.number().int().nonnegative().optional(),
    trackingUrl: z.string().optional(),
    eta: z.string().optional(),
  })
  .strict();
export type OrderItemStatusV2 = z.infer<typeof OrderItemStatusV2Schema>;

/** A single normalized order row. */
export const OrderV2Schema = z
  .object({
    orderId: z.string(),
    status: OrderStatusV2Schema,
    createdAt: z.string().datetime({ offset: true }).optional(),
    totalPoints: z.number().nonnegative().optional(),
    itemCount: z.number().int().nonnegative().optional(),
    canCancel: z.boolean().optional(),
    itemStatuses: z.array(OrderItemStatusV2Schema).readonly().optional(),
  })
  .strict();
export type OrderV2 = z.infer<typeof OrderV2Schema>;

/**
 * The closed, deterministic host-refresh actions (roadmap B2). Carried on
 * the AG-UI invoke path as `forwardedProps.hostAction`; the runtime answers
 * each with a zero-token deterministic STATE_SNAPSHOT. This is the single
 * source of truth for that closed set — there is no generic command bus.
 */
export const HOST_ACTIONS = [
  'overview_refresh',
  'orders_refresh',
  'product_detail_refresh',
  'order_detail_refresh',
] as const;
export const HostActionSchema = z.enum(HOST_ACTIONS);
export type HostAction = z.infer<typeof HostActionSchema>;

/**
 * Closed host-action request. Legacy overview/orders callers may keep sending
 * the bare action string; argument-bearing reads use this strict envelope.
 */
export const HostActionRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('overview_refresh'),
      storefrontId: StorefrontIdSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('orders_refresh') }).strict(),
  z
    .object({
      action: z.literal('product_detail_refresh'),
      productId: z.string().trim().min(1).max(120),
      storefrontId: StorefrontIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('order_detail_refresh'),
      orderId: z.string().trim().min(1).max(120),
    })
    .strict(),
]);
export type HostActionRequest = z.infer<typeof HostActionRequestSchema>;
/** Only argument-free reads retain the legacy bare-string wire form. */
export type LegacyHostAction = Extract<HostAction, 'overview_refresh' | 'orders_refresh'>;
export type HostActionInvocation = LegacyHostAction | HostActionRequest;

export const HOST_ACTION_DISPOSITIONS = ['complete', 'partial', 'unavailable'] as const;
export const HostActionDispositionSchema = z.enum(HOST_ACTION_DISPOSITIONS);
export type HostActionDisposition = z.infer<typeof HostActionDispositionSchema>;

/**
 * Provenance marker stamped onto `ordersV2` by a host-action refresh: which
 * action produced this observation, whether all of its reads completed
 * (`complete` = all, `partial` = some failed, `unavailable` = all failed), and
 * the names of the reads that failed. Absent on a model-driven order read.
 */
export const HostActionReadModelSchema = z
  .object({
    action: HostActionSchema,
    disposition: HostActionDispositionSchema,
    failed: z.array(z.string()).readonly(),
  })
  .strict();
export type HostActionReadModel = z.infer<typeof HostActionReadModelSchema>;

export const OrdersV2StateSchema = z
  .object({
    items: z.array(OrderV2Schema).readonly(),
    /** Server timestamp when the order set was observed. */
    observedAt: z.string().datetime({ offset: true }),
    meta: z
      .object({
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        perPage: z.number().int().positive(),
      })
      .strict()
      .optional(),
    /** Host-action provenance (roadmap B2); absent on model-driven reads. */
    readModel: HostActionReadModelSchema.optional(),
  })
  .strict();
export type OrdersV2State = z.infer<typeof OrdersV2StateSchema>;
