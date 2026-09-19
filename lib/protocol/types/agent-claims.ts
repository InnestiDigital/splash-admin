/**
 * AgentClaims — the keystone inbound-identity contract.
 *
 * The single shape both the runtime and Podium issuer validate (the consumer —
 * the AgentCore Runtime `customJWTAuthorizer`) and podium.api (the issuer).
 * Sibling of {@link TenantContext}: that is the server-DERIVED trusted identity
 * carried on the request hot path; this is the wire-level CLAIM set a token
 * presents at the trust boundary, before derivation.
 *
 * - Member token carries identity + tenant: `iss`, `aud`, `sub`
 *   (member user id), `program_id`, `program_slug` (= the program slug), and a
 *   `token_use` discriminator. Cohort-enforced mints additionally carry the
 *   all-or-nothing signed `concierge_assignment` and
 *   `concierge_cohort_version` provenance tuple.
 * - `rbac` is an OPTIONAL reserved slot. It is ABSENT for members (members carry
 *   no RBAC in podium.api) and is populated only for admin/ops persona tokens.
 *   Its podium grants use podium's permission dot-notation
 *   (`<domain>.<resource>.<action>`) mapped to `1` (read) | `2` (write) — the
 *   real `Permission` type values; `use=0` is never granted in a claim.
 * - There is deliberately NO `reach` key. reach-api owns reach RBAC entirely;
 *   a podium-issued token never speaks for reach. The guard fail-closes if a
 *   `reach` key appears under `rbac`.
 */

import {
  ConciergeCohortSchema,
  type ConciergeCohortAssignment,
} from './concierge-cohort.js';

// `'ops'` is RESERVED and unimplemented: it maps to the `reach_ops` persona,
// which nothing targets today (an ops actor routes to `unsupported` and is
// fail-closed-blocked on every tool). It stays in the closed set for
// compile-time exhaustiveness across the consumer's token_use→persona switch,
// not because an ops token is minted or wired anywhere yet.
export const AGENT_TOKEN_USES = ['member', 'admin', 'ops'] as const;
export type AgentTokenUse = (typeof AGENT_TOKEN_USES)[number];

/**
 * JWT `aud` — a single audience or a non-empty list (RFC 7519 §4.1.3).
 * podium.api signs via lcobucci (`permittedFor`), which always serializes
 * `aud` as a JSON array, so the contract must accept both forms.
 */
export type AgentAudience = string | readonly string[];

/** podium permission dot-notation name → 1 (read) | 2 (write). */
export type PodiumRbacGrants = Readonly<Record<string, 1 | 2>>;

/**
 * Reserved RBAC tree. Only `podium` is permitted. NO `reach` key — reach RBAC
 * is never carried by a podium-issued token.
 */
export interface AgentRbac {
  readonly podium: PodiumRbacGrants;
}

export interface AgentClaims {
  /** Stable issuer URL (per-env). NOTE: podium.api currently emits `$request->url()`. */
  readonly iss: string;
  /** Audience the authorizer validates (e.g. `podium-api`); string or list. */
  readonly aud: AgentAudience;
  /** Subject = member user id. */
  readonly sub: string;
  /** Member's `program_id`. */
  readonly program_id: string;
  /** Tenant identifier (= podium program slug). */
  readonly program_slug: string;
  /** Persona discriminator. Members carry `'member'`. */
  readonly token_use: AgentTokenUse;
  /** Signed treatment/holdout assignment; member tokens only. */
  readonly concierge_assignment?: ConciergeCohortAssignment;
  /** Version of the eligible cohort definition used at mint time. */
  readonly concierge_cohort_version?: string;
  /** Reserved; absent for members, populated for admin/ops personas. */
  readonly rbac?: AgentRbac;
}

const REQUIRED_STRING_FIELDS = ['iss', 'sub', 'program_id', 'program_slug'] as const;
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  ...REQUIRED_STRING_FIELDS,
  'aud',
  'token_use',
  'concierge_assignment',
  'concierge_cohort_version',
  'rbac',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isAgentAudience(v: unknown): v is AgentAudience {
  if (isNonEmptyString(v)) return true;
  return Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);
}

/**
 * Strict, fail-closed shape check for the inbound claim set. Rejects any
 * unknown top-level key (no passthrough), any missing/empty required field, an
 * unknown `token_use`, and any malformed/`reach`-bearing `rbac`.
 */
export function isAgentClaims(value: unknown): value is AgentClaims {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  // Strict: no claim may carry a key outside the closed set.
  for (const key of Object.keys(v)) {
    if (!ALLOWED_KEYS.has(key)) return false;
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(v[field])) return false;
  }

  if (!isAgentAudience(v['aud'])) return false;

  // Honest check: confirm it is a string, then test membership — no cast that
  // asserts the very union being validated.
  const tokenUse = v['token_use'];
  if (typeof tokenUse !== 'string' || !(AGENT_TOKEN_USES as readonly string[]).includes(tokenUse)) {
    return false;
  }

  const cohortValues = [v['concierge_assignment'], v['concierge_cohort_version']];
  const cohortValueCount = cohortValues.filter((value) => value !== undefined).length;
  if (cohortValueCount !== 0 && cohortValueCount !== cohortValues.length) return false;
  if (cohortValueCount > 0) {
    if (tokenUse !== 'member') return false;
    const cohort = ConciergeCohortSchema.safeParse({
      assignment: v['concierge_assignment'],
      version: v['concierge_cohort_version'],
    });
    if (!cohort.success) return false;
  }

  if (v['rbac'] !== undefined && !isAgentRbac(v['rbac'])) return false;

  return true;
}

function isAgentRbac(value: unknown): value is AgentRbac {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  // Only `podium` is permitted — a `reach` key (or any other) fail-closes.
  for (const key of Object.keys(v)) {
    if (key !== 'podium') return false;
  }
  const podium = v['podium'];
  if (podium === null || typeof podium !== 'object') return false;
  // Strict equality on 1|2 — an empty grant map is deliberately VALID (a
  // grant-less admin/ops slot); any value other than 1 or 2 fail-closes.
  for (const grant of Object.values(podium as Record<string, unknown>)) {
    if (grant !== 1 && grant !== 2) return false;
  }
  return true;
}
