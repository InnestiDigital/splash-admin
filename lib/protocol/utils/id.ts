/**
 * Generate a unique ID string using random characters and a timestamp.
 * Produces URL-safe, lowercase alphanumeric strings suitable for
 * ephemeral client-side identifiers (session IDs, message IDs, etc.).
 *
 * @param prefix - Optional prefix prepended with an underscore separator
 * @returns A unique identifier string
 *
 * @example
 * generateId()        // "k7f2x9m1abc..."
 * generateId('msg')   // "msg_k7f2x9m1abc..."
 */
export function generateId(prefix?: string): string {
  const random = Math.random().toString(36).slice(2);
  const timestamp = Date.now().toString(36);
  const id = `${random}${timestamp}`;
  return prefix ? `${prefix}_${id}` : id;
}
