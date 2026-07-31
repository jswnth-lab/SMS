import { hc } from 'hono/client';
import type { AppType } from './index';

/**
 * Typed fetch client for the web/mobile apps: `hc<AppType>` gives full
 * request/response typing (paths, params, json bodies) derived straight
 * from the route definitions in src/routes/*.ts and src/index.ts, so a
 * route change here is a type error at the call site, not a runtime
 * surprise. `init` lets callers set headers (e.g. `Authorization: Bearer
 * <token>` for the mobile bearer-token session, or `credentials:
 * 'include'` for the web cookie session).
 */
export function createApiClient(baseUrl: string, init?: RequestInit) {
  return hc<AppType>(baseUrl, { init });
}

export type { AppType };
