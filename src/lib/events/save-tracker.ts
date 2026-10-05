/**
 * Tracks the details form's saves, so the reveal reads the card only after the host's last edit
 * has landed (`docs/screen-spec.md` `generation`: the card shows the host's latest details).
 *
 * The form registers a `flush` (starts any edit still waiting on its debounce) and reports every
 * save it makes with `track`. `settle` flushes, then waits until every save, including ones started
 * meanwhile, has finished, whether it succeeded or failed: a failed save never blocks the reveal.
 */

export interface SaveTracker {
  /** Reports a save; returns it unchanged. */
  track<T>(save: Promise<T>): Promise<T>;
  /** Registers what starts debounced edits now; returns how to unregister it. */
  registerFlush(flush: () => void): () => void;
  /** Resolves once nothing is waiting to save and nothing is saving. */
  settle(): Promise<void>;
}

export function createSaveTracker(): SaveTracker {
  const inFlight = new Set<Promise<unknown>>();
  const flushers = new Set<() => void>();
  return {
    track(save) {
      const done = save.then(
        () => undefined,
        () => undefined,
      );
      inFlight.add(done);
      void done.then(() => inFlight.delete(done));
      return save;
    },
    registerFlush(flush) {
      flushers.add(flush);
      return () => {
        flushers.delete(flush);
      };
    },
    async settle() {
      for (const flush of [...flushers]) flush();
      while (inFlight.size > 0) await Promise.all([...inFlight]);
    },
  };
}
