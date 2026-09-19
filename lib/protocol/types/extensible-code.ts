/**
 * Forward-compatible code pattern — a closed set of KNOWN codes plus an open
 * catch-all so a newer producer can emit a code an older consumer has never
 * seen without a decode failure.
 *
 * The zod side of the pattern (see each code module) is an OPEN `z.string()`
 * bound: the wire NEVER rejects an unrecognised code. Producers branch on the
 * exported known set (`*_CODES` tuple / `Known*Schema` enum); anything else is
 * handled as a generic, forward-compatible code.
 *
 * The type side is {@link ExtensibleCode}: `string & Record<never, never>`
 * widens the union to accept ANY string at the type level — so a newer
 * producer's unseen code still type-checks — while KEEPING editor autocomplete
 * on the known members. `Record<never, never>` is the empty object type; it is
 * written this way rather than a bare `{}` so it passes
 * `@typescript-eslint/no-empty-object-type`.
 */
export type ExtensibleCode<Known extends string> = Known | (string & Record<never, never>);
