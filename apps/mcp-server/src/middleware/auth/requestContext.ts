/**
 * Per-request authentication context.
 *
 * The MCP high-level Server request handlers (ListTools / CallTool) don't
 * receive the underlying HTTP request, so we use AsyncLocalStorage to carry the
 * caller's bearer token from the HTTP transport layer into the tool handlers.
 *
 * `resolveAuthContext()` validates the token once per request (memoized).
 * When no token is present it returns anonymous context so public tools
 * (clinic_search, clinic_getInfo) remain accessible without auth.
 * When a token IS present but invalid, the error propagates — fail-closed.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthContext } from "@queuemed/core";
import { ANONYMOUS_CONTEXT } from "@queuemed/core";
import { validateToken } from "./authService.js";

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
    store.resolved = validateToken(store.token);
  }

  return store.resolved;
}
