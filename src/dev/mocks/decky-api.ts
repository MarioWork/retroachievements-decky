/**
 * Harness stand-in for @decky/api. Aliased in by vite.config.ts; never bundled
 * into the plugin.
 *
 * `callable(route)` reimplements the *transport* of the Python backend -- the
 * route table, the credential store and the `{ok, data|error}` envelope -- and
 * nothing else. Parsing, sorting and rendering all stay in the real shipping
 * code, so what you click here is what runs on the Deck.
 *
 * Requests go to /API/*, which Vite proxies to retroachievements.org; on the
 * Deck the Python backend makes the identical call.
 */

const STORAGE_KEY = "ra-dev-credentials";

interface DevCredentials {
  username: string;
  apiKey: string;
  notifyUnlocks: boolean;
}

const EMPTY_CREDENTIALS: DevCredentials = { username: "", apiKey: "", notifyUnlocks: false };

type ErrorKind = "config" | "auth" | "notFound" | "rateLimit" | "network" | "parse" | "unexpected";

const envelope = {
  ok: (data: unknown) => ({ ok: true, data }),
  err: (kind: ErrorKind, message: string) => ({ ok: false, error: { kind, message } }),
};

/** Carries the same tagged `kind` the Python backend would return. */
class DevError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "DevError";
  }
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

function loadCredentials(): DevCredentials {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EMPTY_CREDENTIALS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_CREDENTIALS;
    const record = parsed as Record<string, unknown>;
    return {
      username: asString(record.username),
      apiKey: asString(record.apiKey),
      notifyUnlocks: record.notifyUnlocks === true,
    };
  } catch {
    return EMPTY_CREDENTIALS;
  }
}

function storeCredentials(credentials: DevCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

function statusToKind(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "notFound";
  if (status === 429) return "rateLimit";
  return "network";
}

async function raGet(
  endpoint: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<unknown> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  query.set("y", apiKey);

  const response = await fetch(`/API/${endpoint}?${query.toString()}`);
  if (!response.ok) {
    throw new DevError(statusToKind(response.status), `HTTP ${String(response.status)}`);
  }
  return response.json();
}

/** Mirrors RaClient._raise_for_api_error: RA answers 200 with an error body. */
function assertNoApiError(data: unknown): void {
  if (typeof data !== "object" || data === null) return;
  const message = (data as Record<string, unknown>).Error;
  if (typeof message !== "string" || message === "") return;
  const kind: ErrorKind = /key|auth|credential/i.test(message) ? "auth" : "network";
  throw new DevError(kind, message);
}

async function withUser(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<unknown> {
  const { username, apiKey } = loadCredentials();
  if (username === "" || apiKey === "") {
    throw new DevError("config", "No account configured.");
  }
  const data = await raGet(endpoint, { ...params, u: username }, apiKey);
  assertNoApiError(data);
  return data;
}

const routes: Record<string, (args: readonly unknown[]) => Promise<unknown>> = {
  get_settings: () => {
    const { username, apiKey, notifyUnlocks } = loadCredentials();
    return Promise.resolve({ username, has_key: apiKey !== "", notify_unlocks: notifyUnlocks });
  },

  set_notify_unlocks: (args) => {
    const current = loadCredentials();
    const notifyUnlocks = args[0] === true;
    storeCredentials({ ...current, notifyUnlocks });
    return Promise.resolve({
      username: current.username,
      has_key: current.apiKey !== "",
      notify_unlocks: notifyUnlocks,
    });
  },

  save_settings: async (args) => {
    const username = asString(args[0]).trim();
    const apiKey = asString(args[1]).trim();
    if (username === "" || apiKey === "") {
      throw new DevError("config", "Enter both a username and a key.");
    }

    const data = await raGet("API_GetUserProfile.php", { u: username }, apiKey);
    assertNoApiError(data);
    const user = (data as Record<string, unknown>).User;
    if (typeof user !== "string" || user === "") {
      throw new DevError("auth", "Those credentials did not work.");
    }

    const previous = loadCredentials();
    storeCredentials({ username, apiKey, notifyUnlocks: previous.notifyUnlocks });
    return { username, has_key: true, notify_unlocks: previous.notifyUnlocks };
  },

  clear_settings: () => {
    localStorage.removeItem(STORAGE_KEY);
    return Promise.resolve({ username: "", has_key: false, notify_unlocks: false });
  },

  get_profile: () => withUser("API_GetUserProfile.php", {}),
  get_user_summary: () => withUser("API_GetUserSummary.php", { g: 0, a: 0 }),

  get_recent_achievements: (args) =>
    withUser("API_GetUserRecentAchievements.php", { m: Number(args[0] ?? 43200) }),

  get_recently_played: (args) =>
    withUser("API_GetUserRecentlyPlayedGames.php", {
      c: Number(args[0] ?? 10),
      o: Number(args[1] ?? 0),
    }),

  // Mirrors RaClient.get_my_games: RA caps a page at 500, so a large library
  // needs following. Kept in step with the backend so the harness and the Deck
  // show the same list.
  get_my_games: async () => {
    const PAGE_SIZE = 500;
    const MAX_PAGES = 10;
    const results: unknown[] = [];
    let total = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await withUser("API_GetUserCompletionProgress.php", {
        c: PAGE_SIZE,
        o: page * PAGE_SIZE,
      });
      if (typeof body !== "object" || body === null) break;

      const record = body as Record<string, unknown>;
      const reported = Number(record.Total);
      if (Number.isFinite(reported)) total = Math.max(total, reported);

      const chunk: unknown = record.Results;
      if (!Array.isArray(chunk) || chunk.length === 0) break;

      results.push(...(chunk as unknown[]));
      if (results.length >= total || chunk.length < PAGE_SIZE) break;
    }

    return { Total: Math.max(total, results.length), Results: results };
  },

  get_game_progress: (args) =>
    withUser("API_GetGameInfoAndUserProgress.php", { g: Number(args[0] ?? 0), a: 1 }),
};

/**
 * Fault injection. The failure paths -- a rejected key, no connection, stale
 * cache, a half-loaded library -- are the ones hardest to reach by accident and
 * easiest to get wrong, so the harness can force each of them.
 */
export type FaultMode = "none" | "auth" | "network" | "rateLimit" | "stale" | "partial";

export const FAULT_MODES: readonly { mode: FaultMode; label: string }[] = [
  { mode: "none", label: "No fault" },
  { mode: "auth", label: "Rejected API key" },
  { mode: "network", label: "No connection" },
  { mode: "rateLimit", label: "Rate limited" },
  { mode: "stale", label: "Offline (stale cache)" },
  { mode: "partial", label: "Partial library" },
];

/** Keeps the first half and reports the real total, exactly as the backend does
 * when paging fails partway with nothing cached to fall back on. */
function truncatedLibrary(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return envelope.ok(data);

  const record = data as Record<string, unknown>;
  const results = Array.isArray(record.Results) ? (record.Results as unknown[]) : [];
  const kept = results.slice(0, Math.max(1, Math.floor(results.length / 2)));

  return {
    ok: true,
    data: { Total: kept.length, Results: kept },
    stale_seconds: null,
    partial_total: results.length,
  };
}

// Persisted so it survives the reload that applies it -- module state alone
// would reset before any view refetched.
const FAULT_KEY = "ra-dev-fault";

function readFaultMode(): FaultMode {
  try {
    const stored = localStorage.getItem(FAULT_KEY);
    return FAULT_MODES.some((entry) => entry.mode === stored) ? (stored as FaultMode) : "none";
  } catch {
    return "none";
  }
}

let faultMode: FaultMode = readFaultMode();

export function setFaultMode(mode: FaultMode): void {
  faultMode = mode;
  try {
    localStorage.setItem(FAULT_KEY, mode);
  } catch {
    // A harness convenience; not worth failing over.
  }
}

export function getFaultMode(): FaultMode {
  return faultMode;
}

/** Roughly a day old, so the age formatting is visibly exercised. */
const STALE_AGE_SECONDS = 26 * 60 * 60;

/** Settings routes stay usable under fault modes, or you could not switch back. */
const ALWAYS_LIVE = new Set([
  "get_settings",
  "save_settings",
  "clear_settings",
  "set_notify_unlocks",
]);

async function handle(route: string, args: readonly unknown[]): Promise<unknown> {
  const handler = routes[route];
  if (handler === undefined) {
    return envelope.err("unexpected", `Dev harness has no route "${route}".`);
  }

  if (!ALWAYS_LIVE.has(route)) {
    if (faultMode === "auth") {
      return envelope.err("auth", "RetroAchievements rejected your API key.");
    }
    if (faultMode === "network") {
      return envelope.err("network", "Could not reach RetroAchievements.");
    }
    if (faultMode === "rateLimit") {
      return envelope.err("rateLimit", "RetroAchievements is rate limiting us.");
    }
  }

  try {
    const data = await handler(args);

    if (!ALWAYS_LIVE.has(route) && faultMode === "stale") {
      // Real data, presented as the backend would after falling back to cache.
      return { ok: true, data, stale_seconds: STALE_AGE_SECONDS, partial_total: null };
    }

    if (faultMode === "partial" && route === "get_my_games") {
      return truncatedLibrary(data);
    }

    return envelope.ok(data);
  } catch (cause) {
    if (cause instanceof DevError) {
      return envelope.err(cause.kind, cause.message);
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    // fetch() rejects rather than resolving when the dev server or network is down.
    return envelope.err("network", message);
  }
}

export const callable =
  <Args extends unknown[] = [], Return = void>(route: string) =>
  (...args: Args): Promise<Return> =>
    handle(route, args) as Promise<Return>;

export const call = <Args extends unknown[] = [], Return = void>(
  route: string,
  ...args: Args
): Promise<Return> => handle(route, args) as Promise<Return>;

/** No CSP to work around in a browser, so this is the identity function. */
export const getExternalResourceURL = (url: string): string => url;

export const useQuickAccessVisible = (): boolean => true;

export const fetchNoCors = (input: string, init?: RequestInit): Promise<Response> =>
  fetch(input, init);

export const definePlugin = <T>(fn: T): T => fn;

/** ReactNode in the real API; the harness only ever passes strings or numbers. */
const renderable = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/**
 * A visible toast, so the wording and layout can be judged in the browser.
 * Steam renders its own; this only approximates the shape.
 */
export const toaster = {
  toast: (options: { title?: unknown; body?: unknown; duration?: number }): void => {
    const node = document.createElement("div");
    node.className = "dev-toast";

    const title = document.createElement("div");
    title.className = "dev-toast-title";
    title.textContent = renderable(options.title);

    const body = document.createElement("div");
    body.className = "dev-toast-body";
    body.textContent = renderable(options.body);

    node.append(title, body);
    document.body.append(node);

    setTimeout(() => {
      node.remove();
    }, options.duration ?? 5000);
  },
};

/**
 * A real event bus rather than a no-op, so the backend's `decky.emit` can be
 * simulated. `emitForDev` is what the harness's "Simulate unlock" button calls.
 */
type Listener = (...args: never[]) => unknown;
const listeners = new Map<string, Set<Listener>>();

export const addEventListener = <Args extends unknown[] = []>(
  event: string,
  listener: (...args: Args) => unknown,
): ((...args: Args) => unknown) => {
  const set = listeners.get(event) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(event, set);
  return listener;
};

export const removeEventListener = <Args extends unknown[] = []>(
  event: string,
  listener: (...args: Args) => unknown,
): void => {
  listeners.get(event)?.delete(listener);
};

/** Harness only: delivers an event as the backend would. Returns listener count. */
export function emitForDev(event: string, ...args: unknown[]): number {
  const set = listeners.get(event);
  if (set === undefined) return 0;
  for (const listener of set) (listener as (...a: unknown[]) => unknown)(...args);
  return set.size;
}
export const routerHook = {
  addRoute: (): void => undefined,
  removeRoute: (): void => undefined,
};
