/**
 * Wraps an async event handler so a rejection is logged (util/debug keeps
 * it for bug reports) instead of becoming an unhandled rejection. Use for
 * every `addEventListener(..., async () => ...)`: the listener's returned
 * promise is otherwise dropped.
 */
export function safeAsync<A extends unknown[]>(fn: (...args: A) => Promise<unknown>): (...args: A) => void {
  return (...args: A) => {
    fn(...args).catch((e: unknown) => { console.error('[handler]', e); });
  };
}
