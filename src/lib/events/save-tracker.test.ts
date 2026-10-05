import { describe, expect, it } from "vitest";

import { createSaveTracker } from "./save-tracker";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSaveTracker", () => {
  it("settles at once when nothing is saving", async () => {
    await expect(createSaveTracker().settle()).resolves.toBeUndefined();
  });

  it("waits for a save already running", async () => {
    const tracker = createSaveTracker();
    const save = deferred();
    tracker.track(save.promise);
    let settled = false;
    const done = tracker.settle().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    save.resolve();
    await done;
    expect(settled).toBe(true);
  });

  it("flushes waiting edits first, and waits for the saves the flush starts", async () => {
    const tracker = createSaveTracker();
    const save = deferred();
    let flushed = 0;
    tracker.registerFlush(() => {
      flushed += 1;
      tracker.track(save.promise);
    });
    let settled = false;
    const done = tracker.settle().then(() => (settled = true));
    await Promise.resolve();
    expect(flushed).toBe(1);
    expect(settled).toBe(false);
    save.resolve();
    await done;
    expect(settled).toBe(true);
  });

  it("waits for a save started while it was waiting", async () => {
    const tracker = createSaveTracker();
    const first = deferred();
    const second = deferred();
    tracker.track(first.promise);
    let settled = false;
    const done = tracker.settle().then(() => (settled = true));
    tracker.track(second.promise);
    first.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    second.resolve();
    await done;
    expect(settled).toBe(true);
  });

  it("is not blocked by a failed save, and the caller still sees the failure", async () => {
    const tracker = createSaveTracker();
    const save = deferred();
    const tracked = tracker.track(save.promise);
    const rejected = expect(tracked).rejects.toThrow("down");
    save.reject(new Error("down"));
    await rejected;
    await expect(tracker.settle()).resolves.toBeUndefined();
  });

  it("stops flushing a form that unregistered", async () => {
    const tracker = createSaveTracker();
    let flushed = 0;
    const off = tracker.registerFlush(() => (flushed += 1));
    off();
    await tracker.settle();
    expect(flushed).toBe(0);
  });
});
