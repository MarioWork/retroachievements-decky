/**
 * The one place loading/error state is modelled.
 *
 * Returns a discriminated union rather than `{data, loading, error}`, so a view
 * physically cannot render a half-loaded state: there is no way to hold data and
 * be loading at the same time. `StateBoundary` consumes this directly.
 *
 * Callers must memoise `load` (useCallback) -- it is the effect's dependency.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { AppError, Result } from "../types/result";

export type AsyncState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: AppError }
  | {
      readonly status: "loaded";
      readonly data: T;
      /** Set when the network failed and expired cache was served instead. */
      readonly staleSeconds: number | null;
      /** Set when only part of a paged collection could be fetched. */
      readonly partialTotal: number | null;
    };

export interface AsyncResource<T> {
  readonly state: AsyncState<T>;
  /** True during an explicit refresh, while the previous data is still shown. */
  readonly refreshing: boolean;
  readonly refresh: () => void;
}

export function useAsyncResource<T>(
  load: (force: boolean) => Promise<Result<T>>,
): AsyncResource<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  // Guards against setting state after unmount, and against a slow first
  // request landing on top of a newer refresh.
  const generation = useRef(0);

  const run = useCallback(
    async (force: boolean) => {
      const current = ++generation.current;
      if (force) setRefreshing(true);

      const result = await load(force);

      if (generation.current !== current) return;
      setState(
        result.ok
          ? {
              status: "loaded",
              data: result.data,
              staleSeconds: result.staleSeconds,
              partialTotal: result.partialTotal,
            }
          : { status: "error", error: result.error },
      );
      setRefreshing(false);
    },
    [load],
  );

  useEffect(() => {
    setState({ status: "loading" });
    void run(false);
    return () => {
      // Invalidate anything in flight for this mount.
      generation.current += 1;
    };
  }, [run]);

  const refresh = useCallback(() => {
    void run(true);
  }, [run]);

  return { state, refreshing, refresh };
}
