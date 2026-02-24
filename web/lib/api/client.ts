/**
 * Facilitator API client.
 *
 * All frontend fetch calls go through this module so the facilitator URL
 * is configured in exactly one place (NEXT_PUBLIC_FACILITATOR_URL).
 *
 * When the env var is empty (e.g. local dev with Express on the same origin),
 * paths resolve to relative — backward compatible.
 */

const FACILITATOR_URL = process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "";

/** Build a full URL for the facilitator API. */
export function facilitatorUrl(path: string): string {
  return `${FACILITATOR_URL}${path}`;
}

/** fetch() wrapper that targets the facilitator and sets JSON content-type. */
export async function facilitatorFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(facilitatorUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}
