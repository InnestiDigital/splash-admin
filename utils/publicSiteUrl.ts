export interface PublicSiteUrlInput {
  /** Stored platform hostname, retained as a fallback for incomplete context. */
  storedDomain?: string | null
  siteSlug?: string | null
  programSlug?: string | null
  baseDomain?: string | null
  protocol?: string
}

export function buildPlatformDomain(input: Omit<PublicSiteUrlInput, 'protocol'>): string {
  const baseDomain = input.baseDomain?.trim().replace(/^\.+|\.+$/g, '')
  const canonicalDomain = input.siteSlug && input.programSlug && baseDomain
    ? `${input.siteSlug}--${input.programSlug}.${baseDomain}`
    : null
  return canonicalDomain || input.storedDomain?.trim() || ''
}

/**
 * Build the current platform URL from slugs + runtime base domain.
 *
 * Recomputing the canonical hostname is intentional: an existing development
 * database may still store `*.splash.local`, while the current local runtime
 * serves the same tenant at `*.localhost` without manual DNS configuration.
 */
export function buildPublicSiteUrl(input: PublicSiteUrlInput): string {
  const domain = buildPlatformDomain(input)
  if (!domain) return ''

  const protocol = (input.protocol || 'https:').replace(/:*$/, ':')
  return `${protocol}//${domain}/`
}
