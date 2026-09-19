// Reactivity-inversion seam: a mutable value cell that frameworks bind to.
// `snapshot()` is the synchronous current value; `subscribe()` fires on every
// change after the call and returns an unsubscribe.
//
// Reentrancy: each notification iterates a snapshot of the listener set, so a
// subscribe/unsubscribe performed inside a listener takes effect on the NEXT
// set(), never mid-round.
//
// Disposal ownership: there is no cell-level dispose. Lifecycle is per
// subscription — the caller that subscribed owns the returned unsubscribe (Vue
// `onScopeDispose`, Angular `DestroyRef`). The cell holds only the current value
// and live listeners; dropping all references collects it.
//
// Listener errors are never swallowed: a throwing listener does not starve the
// others (each is isolated), but every caught error is surfaced through
// `onListenerError`, which defaults to rethrowing so a buggy listener is loud.

export interface Observable<T> {
  snapshot(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export interface ObservableCell<T> {
  readonly observable: Observable<T>;
  get(): T;
  set(next: T): void;
}

function rethrow(error: unknown): never {
  throw error;
}

export function createObservable<T>(
  initial: T,
  onListenerError: (error: unknown) => void = rethrow,
): ObservableCell<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  const observable: Observable<T> = {
    snapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    observable,
    get: () => value,
    set(next) {
      value = next;
      const caught: unknown[] = [];
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch (error) {
          caught.push(error);
        }
      }
      if (caught.length === 1) onListenerError(caught[0]);
      else if (caught.length > 1) onListenerError(new AggregateError(caught));
    },
  };
}
