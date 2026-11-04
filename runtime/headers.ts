import type { Config } from "@hey-api/client-fetch";

// Keep object-header deletion/array semantics; normalize the other HeadersInit forms
// before generated defaults are merged with the caller's per-request headers.
export function normalizeHeaders(headers: Config["headers"]): Record<string, unknown> {
  if (!headers || typeof headers !== "object") return {};
  if (headers instanceof Headers || Array.isArray(headers)) {
    const values = headers instanceof Headers ? headers : new Headers(headers as HeadersInit);
    const result: Record<string, string> = Object.create(null);
    values.forEach((value, name) => { result[name] = value; });
    return result;
  }
  return headers as Record<string, unknown>;
}
