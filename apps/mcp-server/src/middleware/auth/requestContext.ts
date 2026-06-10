/**
 * Per-request authentication context.
 *
 * The MCP high-level Server request handlers (ListTools / CallTool) don't
 * receive the underlying HTTP request, so we use AsyncLocalStorage to carry the
 * caller's bearer token from the HTTP transport layer into the tool handlers.
 *
 * `resolveAuthContext()` validates the token once per request (memoized) and
 * falls back to anonymous on any failure, so public tools keep working even
 * when Supabase isn't configured.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthContext } from "./types.js";
import { ANONYMOUS_CONTEXT } from "./types.js";
import { validateToken } from "./authService.js";
import { logger } from "../../utils/logger.js";

interface RequestAuthStore {
  token?: string;
  /** Memoized resolution so we validate the token at most once per request. */
  resolved?: Promise<AuthContext>;
  /** Memoized per-request JWT-scoped service container (typed as ServiceContainer in services/index). */
  services?: unknown;
}

const storage = new AsyncLocalStorage<RequestAuthStore>();

/** The current request's auth store (token + per-request caches), if any. */
export function getRequestStore(): RequestAuthStore | undefined {
  return storage.getStore();
}

/**
 * Run `fn` with the given bearer token bound to the current async context.
 */
export function runWithAuthToken<T>(token: string | undefined, fn: () => T): T {
  return storage.run({ token }, fn);
}

/**
 * Resolve the AuthContext for the current request. Validates the bound token
 * (once) and returns anonymous on absence or failure.
 */
export function resolveAuthContext(): Promise<AuthContext> {
  const store = storage.getStore();

  if (!store || !store.token) {
    return Promise.resolve(ANONYMOUS_CONTEXT);
  }

  if (!store.resolved) {
    store.resolved = validateToken(store.token).catch((error) => {
      logger.warn("Auth token validation failed; falling back to anonymous", {
        error: error instanceof Error ? error.message : String(error),
      });
      return ANONYMOUS_CONTEXT;
    });
  }

  return store.resolved;
}
