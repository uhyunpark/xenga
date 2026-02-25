import { facilitatorFetch } from "./client";

/**
 * Authenticated facilitator fetch — uses session JWT token.
 * Replaces per-request wallet signing with a Bearer token.
 */
export function authenticatedFetch(
  path: string,
  token: string,
  options?: RequestInit
): Promise<Response> {
  return facilitatorFetch(path, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
