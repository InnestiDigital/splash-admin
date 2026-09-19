// Pure product-results timeline — the client-side render source for product
// cards under AG-UI Tool-Based Generative UI.
//
// Cards render DIRECTLY off the `search_catalog` TOOL_CALL_RESULT that is
// already on the wire. This module owns the pure decode + cap of that tool
// result and the versioned shape that the turn driver persists through an
// injected `TimelineStore` port, so a refresh / reconnect re-renders the last
// search without the model in the loop.
//
// Purity: no browser globals, no framework. The browser-session-backed adapter
// that implements `TimelineStore` lives in the host (the widget), never here.

/**
 * One product the widget renders. Field-for-field the projection the widget's
 * `Product` consumes, derived ONLY from the server-controlled `search_catalog`
 * result. NEVER fabricated client-side: every field traces to the tool result.
 *
 * `deepLink` is the server-composed canonical membersite "View" URL. The card
 * opens it verbatim; the "View" affordance is disabled when it is absent. The
 * client NEVER reconstructs the URL.
 */
export interface ProductResultItem {
  readonly id: string;
  readonly title: string;
  readonly points: number;
  readonly originalPoints?: number;
  readonly promotionEndDate?: string;
  readonly brand?: string;
  readonly imageUrl?: string;
  readonly slug?: string;
  readonly sku?: string;
  readonly deepLink?: string;
  readonly storefrontId?: string;
  readonly storefrontLabel?: string;
}

/**
 * One decoded `search_catalog` result set, keyed by the SDK-issued
 * `toolCallId` so a repeated search in the same turn replaces (never
 * duplicates) and the widget can anchor each set in its own timeline slot.
 */
export interface ProductResultSet {
  /** The SDK `toolCallId` (== `toolUseId`) of the originating search call. */
  readonly toolCallId: string;
  /** Browser-owned user message after which this result set renders. */
  readonly afterMessageId: string | null;
  /** Ordered products as the server returned them (order is display order). */
  readonly items: readonly ProductResultItem[];
}

/**
 * Persisted-shape envelope. `version` is bumped whenever {@link ProductResultSet}
 * / {@link ProductResultItem} change shape, so a stale browser-stored timeline
 * from an older client is DISCARDED rather than mis-parsed.
 */
export const PRODUCT_TIMELINE_VERSION = 3 as const;

export interface PersistedProductTimeline {
  readonly version: typeof PRODUCT_TIMELINE_VERSION;
  readonly sets: readonly ProductResultSet[];
}

/**
 * Render cap. The server returns all hits; the client renders at most this many
 * cards (architect-locked: "render ALL hits, cap 20"). Applied at decode so the
 * cap is enforced before persistence (storage quota) and before render.
 */
export const MAX_PRODUCT_RESULT_ITEMS = 20;

/**
 * Pure storage PORT the turn driver persists the product timeline through.
 * Implementations live in the host (the widget supplies a browser-session
 * adapter); the core stays browser-global-free. Synchronous — a reconnect /
 * refresh re-render must be available at construction without awaiting I/O.
 */
export interface TimelineStore {
  /** Load the persisted timeline for a session, or null when none / stale. */
  load(sessionId: string): PersistedProductTimeline | null;
  /** Persist the timeline for a session. Implementations swallow quota errors. */
  save(sessionId: string, timeline: PersistedProductTimeline): void;
}

/** Tolerant string read. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Tolerant finite-number read. */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Assemble a {@link ProductResultItem} from its required core + extracted
 * optional fields. Single home for the field-by-field build shared by the wire
 * and persisted projections: an `undefined` extraction is OMITTED (never
 * stored), so persisted/compared items carry only fields that trace to a
 * source value.
 */
function assembleItem(
  id: string,
  title: string,
  points: number,
  optional: Partial<Omit<ProductResultItem, 'id' | 'title' | 'points'>>,
): ProductResultItem {
  const item: {
    -readonly [K in keyof ProductResultItem]: ProductResultItem[K];
  } = { id, title, points };

  if (optional.originalPoints !== undefined) item.originalPoints = optional.originalPoints;
  if (optional.promotionEndDate !== undefined) item.promotionEndDate = optional.promotionEndDate;
  if (optional.brand !== undefined) item.brand = optional.brand;
  if (optional.imageUrl !== undefined) item.imageUrl = optional.imageUrl;
  if (optional.slug !== undefined) item.slug = optional.slug;
  if (optional.sku !== undefined) item.sku = optional.sku;
  if (optional.deepLink !== undefined) item.deepLink = optional.deepLink;
  if (optional.storefrontId !== undefined) item.storefrontId = optional.storefrontId;
  if (optional.storefrontLabel !== undefined) item.storefrontLabel = optional.storefrontLabel;

  return item;
}

/**
 * Project one canonical `search_catalog` item into a {@link ProductResultItem}.
 *
 * Discipline mirrors the server adapter: NEVER invent. A row missing both a
 * title and a price is not renderable → returns null (the caller drops it),
 * exactly as a card with no name/price would be wrong to paint.
 *
 * The wire carries the engine's canonical camelCase result unchanged.
 */
function projectWireItem(raw: unknown): ProductResultItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const title = str(r['name']);
  const points = num(r['pricePoints']);
  const id = str(r['id']) ?? str(r['productId']) ?? str(r['slug']);

  if (id === undefined || title === undefined || points === undefined) return null;

  return assembleItem(id, title, points, {
    originalPoints: num(r['originalPricePoints']),
    promotionEndDate: str(r['promotionEndDate']),
    brand: str(r['brand']) ?? str(r['productType']) ?? str(r['category']),
    imageUrl: str(r['imageUrl']),
    slug: str(r['slug']),
    sku: str(r['sku']),
    deepLink: str(r['deepLink']),
    storefrontId: str(r['storefrontId']),
    storefrontLabel: str(r['storefrontLabel']),
  });
}

/**
 * Decode a `search_catalog` TOOL_CALL_RESULT `content` JSON string into a
 * {@link ProductResultSet}. The framer emits the canonical `{ items }` result;
 * any other or malformed shape
 * yields an empty set (never throws — a bad payload drops to zero cards, not a
 * crash). Items are capped at {@link MAX_PRODUCT_RESULT_ITEMS} and order is
 * preserved (it is the display order the resolver relies on).
 *
 */
export function decodeSearchCatalogResult(
  toolCallId: string,
  content: string | undefined,
  afterMessageId: string | null = null,
): ProductResultSet {
  const empty: ProductResultSet = { toolCallId, afterMessageId, items: [] };
  if (typeof content !== 'string') return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return empty;
  }

  const rows = extractItems(parsed);
  if (rows === null) return empty;

  const items: ProductResultItem[] = [];
  for (const row of rows) {
    if (items.length >= MAX_PRODUCT_RESULT_ITEMS) break;
    const item = projectWireItem(row);
    if (item) items.push(item);
  }
  return { toolCallId, afterMessageId, items };
}

/** Pull canonical `items[]` from the tool result. */
function extractItems(parsed: unknown): readonly unknown[] | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const items = (parsed as Record<string, unknown>)['items'];
  return Array.isArray(items) ? items : null;
}

/**
 * Append (or replace, keyed by `toolCallId`) a result set onto the timeline.
 * Immutable — returns a new array. A repeated search in the same turn issues a
 * fresh `toolCallId`, so this is append in the normal case; the key-replace
 * guards the rare SDK retry that reuses an id.
 */
export function appendResultSet(
  timeline: readonly ProductResultSet[],
  set: ProductResultSet,
): readonly ProductResultSet[] {
  const existingIdx = timeline.findIndex((s) => s.toolCallId === set.toolCallId);
  if (existingIdx === -1) return [...timeline, set];
  const next = timeline.slice();
  next[existingIdx] = set;
  return next;
}

/**
 * Validate + normalise a persisted timeline read from the store. A
 * version-mismatch, a non-object, or a malformed `sets` shape returns an empty
 * timeline (the stale store is discarded, not mis-parsed). Each set is
 * re-projected through the same disciplined item guard so a tampered / older
 * persisted item shape cannot inject an unrenderable card.
 */
export function rehydrateTimeline(
  loaded: PersistedProductTimeline | null,
): readonly ProductResultSet[] {
  if (!loaded || typeof loaded !== 'object') return [];
  if (loaded.version !== PRODUCT_TIMELINE_VERSION) return [];
  if (!Array.isArray(loaded.sets)) return [];

  const sets: ProductResultSet[] = [];
  for (const raw of loaded.sets) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const toolCallId = str(s['toolCallId']);
    if (toolCallId === undefined) continue;
    const afterMessageId = s['afterMessageId'] === null ? null : str(s['afterMessageId']);
    if (afterMessageId === undefined) continue;
    const rawItems = Array.isArray(s['items']) ? s['items'] : [];
    const items: ProductResultItem[] = [];
    for (const ri of rawItems) {
      if (items.length >= MAX_PRODUCT_RESULT_ITEMS) break;
      const item = projectPersistedItem(ri);
      if (item) items.push(item);
    }
    sets.push({ toolCallId, afterMessageId, items });
  }
  return sets;
}

/**
 * Project a persisted item back into a {@link ProductResultItem}. Persisted
 * items are already in the projected (camelCase) shape, so this re-validates
 * that shape rather than the canonical wire shape.
 */
function projectPersistedItem(raw: unknown): ProductResultItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r['id']);
  const title = str(r['title']);
  const points = num(r['points']);
  if (id === undefined || title === undefined || points === undefined) return null;

  return assembleItem(id, title, points, {
    originalPoints: num(r['originalPoints']),
    promotionEndDate: str(r['promotionEndDate']),
    brand: str(r['brand']),
    imageUrl: str(r['imageUrl']),
    slug: str(r['slug']),
    sku: str(r['sku']),
    deepLink: str(r['deepLink']),
    storefrontId: str(r['storefrontId']),
    storefrontLabel: str(r['storefrontLabel']),
  });
}

/** Wrap a timeline into the versioned persisted envelope. */
export function toPersistedTimeline(sets: readonly ProductResultSet[]): PersistedProductTimeline {
  return { version: PRODUCT_TIMELINE_VERSION, sets };
}
