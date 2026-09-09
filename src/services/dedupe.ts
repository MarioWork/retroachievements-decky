/**
 * In-flight RPC de-duplication.
 *
 * The dashboard mounts several hooks at once, and more than one of them can want
 * the same profile call. The Python side caches on disk, but only *after* a
 * response lands -- two simultaneous calls would both miss. This collapses them
 * into one.
 */

const inFlight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing !== undefined) {
    return existing as Promise<T>;
  }

  const promise = run().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Test/dev seam; also used when credentials change and old calls are moot. */
export function clearInFlight(): void {
  inFlight.clear();
}
