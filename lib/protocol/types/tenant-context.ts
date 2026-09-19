/**
 * Tenant context — per-request trusted identity. Server-derived only;
 * browser never controls this. Built after RS256 agent-token verification
 * + origin binding by the `AgentTokenService`, then carried
 * end-to-end through the AgentCore Runtime invocation payload and the
 * AsyncLocalStorage frame inside the Strands orchestrator.
 *
 * This type lives in `protocol` because it crosses three package
 * boundaries (server → agent → tools) on the request hot path. The
 * non-secret tenant *config* (`TenantConfig`) and sensitive material
 * (`TenantSecrets`) stay inside `server` — only the per-request trusted
 * identity is shared.
 */

export type TenantSlug = string;

export interface TenantContext {
  readonly requestId: string;
  readonly tenantSlug: TenantSlug;
  readonly clientId: string;
  readonly programId: string;
  readonly memberId: string;
  readonly memberHash: string;
  readonly origin: string;
  /**
   * How the resolver picked the tenant. Always `'program_slug'`
   * today — Podium JWTs always carry the claim (member login,
   * admin login-as, and refresh all preserve it). The field is
   * kept as a closed union so a future second-source claim
   * (e.g. JWE bridge) can be added without breaking consumers.
   */
  readonly tenantResolutionSource: 'program_slug';
}
