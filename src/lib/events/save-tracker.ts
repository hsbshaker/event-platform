/**
 * Tracks the details form's saves, so the reveal reads the card only after the host's last edit
 * has landed (`docs/screen-spec.md` `generation`: the card shows the host's latest details).
 *
 * The form registers a `flush` (starts any edit still waiting on its debounce) and reports every
 * save it makes with `track`. `settle` flushes, then waits until every save, including ones started
 * meanwhile, has finished, whether it succeeded or failed: a failed save never blocks the reveal.
 * `takeFailures` says how many saves failed or were refused since it was last asked, so a surface
 * that closes after its saves (the Creation Mode editor) can stay open to show why.
 */

export interface SaveTracker {
  /**
   * Reports a save; returns it unchanged. It counts as failed if it rejects, or if `ok` says its
   * result is a refusal.
   */
  track<T>(save: Promise<T>, ok?: (result: T) => boolean): Promise<T>;
  /** Registers what starts debounced edits now; returns how to unregister it. */
  registerFlush(flush: () => void): () => void;
  /** Resolves once nothing is waiting to save and nothing is saving. */
  settle(): Promise<void>;
  /** How many tracked saves failed since the last call; resets the count. */
  takeFailures(): number;
}

export function createSaveTracker(): SaveTracker {
  const inFlight = new Set<Promise<unknown>>();
  const flushers = new Set<() => void>();
  let failures = 0;
  return {
    track(save, ok) {
      const done = save.then(
        (result) => {
          if (ok && !ok(result)) failures += 1;
        },
        () => {
          failures += 1;
        },
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
    takeFailures() {
      const count = failures;
      failures = 0;
      return count;
    },
  };
}
