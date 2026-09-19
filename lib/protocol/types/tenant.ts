/**
 * Tenant config types and lookup ports.
 *
 * Lives in `protocol` so it can be consumed by both `server` (where
 * the AWS Secrets Manager adapter lives) and `agent` (where the
 * tenant-scoped OAuth token provider lives) without creating a
 * circular package dependency.
 *
 * Concrete adapters (`InMemoryTenantStore`, `SecretsManagerTenantStore`,
 * etc.) stay in `server` — only the interfaces + non-secret value
 * types are shared.
 */

import type { TenantSlug } from './tenant-context.js';

export type ScopeProfileName = 'readOnly' | 'cartWrite' | 'submitWrite' | 'adminRead';

export type ScopeProfiles = {
  readonly readOnly: readonly string[];
  readonly cartWrite: readonly string[];
  readonly submitWrite: readonly string[];
  /**
   * Scopes for outbound admin-vocab read calls (the Authorization OAuth bearer
   * carries `mcp.admin.read`). When absent, an admin-vocab tool call fails
   * closed at token-mint time rather than silently falling back to a
   * write-scoped profile.
   */
  readonly adminRead?: readonly string[];
};

/**
 * Non-secret tenant metadata. Resolved lazily from a `TenantStore`
 * by slug; cached in-process. Runtime code consumes this shape
 * directly.
 */
export interface TenantConfig {
  readonly slug: TenantSlug;
  readonly clientId: string;
  readonly programId: string;

  readonly podium: {
    readonly baseUrl: string;
    readonly tokenUrl: string;
    readonly scopeProfiles: ScopeProfiles;
    /**
     * Name of the AgentCore Token Vault credential provider that mints this
     * tenant's outbound Podium M2M (client_credentials) tokens. When absent the
     * token provider derives the name as `podium-${env}-${slug}`.
     */
    readonly vaultCredentialProviderName?: string;
  };

  readonly browser: {
    /**
     * Exact origins only. Wildcard subdomain support, if ever
     * introduced, becomes a separate typed variant — never ad-hoc
     * string match on this field.
     *
     * The `http://localhost:${number}` variant is permitted so the
     * Playwright harness can drive a staging tenant from a local Vite
     * page. Prod tenants list only https origins; the type permits
     * the variant but never forces its use.
     */
    readonly allowedOrigins: ReadonlyArray<`https://${string}` | `http://localhost:${number}`>;
    /**
     * Canonical membersite base URL used to compose deep links from
     * Podium catalog routing metadata. Example:
     * `https://staging-rbc-membersite.podiumrewards.com`. The
     * `ProductDeepLinkBuilder` concatenates `<membersiteBaseUrl>/shop/
     * <slug>?catalog_id=...&product_collection_id=...&catalog_slug=...`.
     *
     * Distinct from `allowedOrigins` (which is the postMessage / CORS
     * allowlist and may include the EC2 host + localhost variants the
     * harness uses). Membersite URL composition needs the single
     * canonical origin, not the allowlist union.
     *
     * When absent the deep-link builder MUST refuse to compose a URL (fail
     * closed) rather than guessing from `allowedOrigins`.
     */
    readonly membersiteBaseUrl?: `https://${string}`;
  };

  readonly agent: {
    readonly modelPolicyProfile?: string;
    /**
     * Per-tenant tool disablement. Names listed here are dropped from
     * the model's tool surface for every flow this tenant runs. Used to
     * scope tenant-specific carve-outs (e.g. a tenant that should not
     * trigger client-side navigation) without forking flow specs.
     *
     * Names that are not in the canonical catalog are silently ignored
     * — the bridge only drops what is present; unknown names cannot
     * leak through this list.
     */
    readonly disabledTools?: ReadonlyArray<string>;
  };
}

export class TenantNotFoundError extends Error {
  constructor(
    public readonly key: string,
    public readonly kind: 'slug',
  ) {
    super(`Tenant not found by ${kind}: ${key}`);
    this.name = 'TenantNotFoundError';
  }
}

export interface TenantStore {
  /**
   * Resolve a tenant by slug. Throws {@link TenantNotFoundError}
   * when no tenant matches. Implementations MUST NOT return a
   * partially-populated `TenantConfig`.
   */
  getBySlug(slug: TenantSlug): Promise<TenantConfig>;

  /**
   * Snapshot of all tenants known to this store. Used for the
   * CORS origin union.
   */
  list(): Promise<readonly TenantConfig[]>;
}
