import { isRecord } from '~/shared/types/guards'

/**
 * Pulls the most specific message out of an ofetch/H3 error without casting.
 *
 * One definition — this used to be copy-pasted (as `extractMessage`, with a
 * local `isRecord`) across `brandFormatStore`, `brandTemplateStore` and
 * `brandIdentityStore`, and reimplemented ad hoc (`e?.data?.statusMessage ||
 * e?.message`) in `fontStore`, `programStore` and `siteStore`. Every admin
 * store that talks to `adminFetch`/`$fetch` should import this instead of
 * growing another copy.
 */
export function extractFetchMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const data = error.data
    if (isRecord(data) && typeof data.statusMessage === 'string' && data.statusMessage.length > 0) {
      return data.statusMessage
    }
    if (typeof error.statusMessage === 'string' && error.statusMessage.length > 0) {
      return error.statusMessage
    }
    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message
    }
  }
  return fallback
}
