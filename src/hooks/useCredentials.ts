/**
 * Credentials are the one piece of state with mutations, so they get their own
 * hook rather than going through `useAsyncResource`.
 *
 * The API key is write-only from the frontend's point of view: it goes out in
 * `save`, and only ever comes back as `hasKey`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearCredentials,
  getCredentials,
  saveCredentials,
  setNotifyUnlocks,
} from "../services/backend";
import type { Credentials } from "../types/ra";
import type { AppError } from "../types/result";

export type CredentialsState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: AppError }
  | { readonly status: "loaded"; readonly credentials: Credentials };

export interface UseCredentials {
  readonly state: CredentialsState;
  readonly saving: boolean;
  /** Resolves to an error to display inline, or null on success. */
  readonly save: (username: string, apiKey: string) => Promise<AppError | null>;
  readonly setNotifications: (enabled: boolean) => Promise<void>;
  readonly clear: () => Promise<void>;
  readonly reload: () => void;
}

export function useCredentials(): UseCredentials {
  const [state, setState] = useState<CredentialsState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const result = await getCredentials();
    if (!mounted.current) return;
    setState(
      result.ok
        ? { status: "loaded", credentials: result.data }
        : { status: "error", error: result.error },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (username: string, apiKey: string): Promise<AppError | null> => {
    setSaving(true);
    const result = await saveCredentials(username, apiKey);
    if (!mounted.current) return null;

    setSaving(false);
    if (!result.ok) return result.error;

    setState({ status: "loaded", credentials: result.data });
    return null;
  }, []);

  const setNotifications = useCallback(async (enabled: boolean) => {
    const result = await setNotifyUnlocks(enabled);
    if (!mounted.current || !result.ok) return;
    setState({ status: "loaded", credentials: result.data });
  }, []);

  const clear = useCallback(async () => {
    const result = await clearCredentials();
    if (!mounted.current) return;
    setState(
      result.ok
        ? { status: "loaded", credentials: result.data }
        : {
            status: "loaded",
            credentials: { username: "", hasKey: false, notifyUnlocks: false },
          },
    );
  }, []);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { state, saving, save, setNotifications, clear, reload };
}
