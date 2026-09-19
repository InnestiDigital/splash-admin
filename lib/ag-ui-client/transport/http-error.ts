/**
 * A failed HTTP response from the agent transport.
 *
 * Thrown — never attached to a mutated Error. The transport reports a
 * non-OK response through exactly this one channel (a thrown HTTPError);
 * there is no parallel onError callback. `status` is the HTTP status code
 * and `body` is the parsed JSON error envelope when the response body was
 * JSON-parseable (otherwise undefined).
 */
export class HTTPError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'HTTPError';
    // Restore the prototype chain across the Error transpile boundary so
    // `instanceof HTTPError` holds.
    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}
