// Generated from runtime/exact.ts by scripts/generate.mjs.
import { isLosslessNumber, LosslessNumber, parse, stringify } from "lossless-json";
import { jsonBodySerializer } from "@hey-api/client-fetch";
import { countFromDecimal } from "./runtime-counts.gen";

const _U64_MAX = (1n << 64n) - 1n;
const _I64_MIN = -(1n << 63n);
const _I64_MAX = (1n << 63n) - 1n;
const _standardBodySerializerSource = Function.prototype.toString.call(jsonBodySerializer.bodySerializer);

export type ExactInteger = string;
export interface ExactPlan {
  kind?: "integer" | "count";
  format?: "uint64" | "int64" | "uint";
  nullable?: boolean;
  raw?: boolean;
  allowString?: boolean;
  alternatives?: ExactPlan[];
  fields?: Record<string, ExactPlan>;
  items?: ExactPlan;
  values?: ExactPlan;
  selectHeader?: string;
  absent?: ExactPlan;
  present?: ExactPlan;
}
interface ExactOperation {
  responses: Record<string, ExactPlan>;
  jsonBody?: boolean;
  body?: ExactPlan;
  query?: ExactPlan;
  path?: ExactPlan;
}

/** Preserve original numeric tokens, including integer spelling required by settings forms. */
export const parseExactJson = (text: string): unknown => parse(text);
export function stringifyExactJson(value: unknown): string {
  const text = stringify(value);
  if (typeof text !== "string") throw new TypeError("Expected a JSON value");
  return text;
}

export function integerFromDecimal(text: string, format: ExactPlan["format"] = "uint64"): ExactInteger {
  if (typeof text !== "string") throw new TypeError("Exact integer requires decimal text");
  if (!["uint64", "int64", "uint"].includes(format)) throw new TypeError("Unknown exact integer format");
  if (!/^-?(0|[1-9]\d*)$/.test(text)) throw new TypeError("Exact integer requires an integer token, not a decimal or exponent");
  if (format !== "uint" && text.replace(/^-/, "").length > 20) throw new RangeError("Integer exceeds declared 64-bit range");
  const value = format === "uint" ? 0n : BigInt(text);
  if (format !== "int64" && (value < 0n || text.startsWith("-"))) throw new RangeError("Unsigned integer cannot be negative");
  if (format === "uint64" && value > _U64_MAX) throw new RangeError("Integer exceeds u64");
  if (format === "int64" && (value < _I64_MIN || value > _I64_MAX)) throw new RangeError("Integer exceeds i64");
  return text;
}

function walk(value: unknown, plan: ExactPlan | undefined, mode: "response" | "body" | "url" | "wire"): unknown {
  if (value === undefined && mode !== "response" && mode !== "wire") return undefined;
  if (plan?.raw && mode === "response" && !plan.fields && !plan.items && !plan.values && !plan.alternatives) return value;
  if (value === null && plan?.nullable) return null;
  if (plan?.alternatives) {
    let failure: unknown;
    for (const variant of plan.alternatives) {
      try { return walk(value, variant, mode); } catch (error) { failure = error; }
    }
    throw failure ?? new TypeError("No matching alternative in exact plan");
  }
  if (plan?.kind) {
    const token = isLosslessNumber(value);
    if (mode === "response" || mode === "wire") {
      if (!token && !(plan.allowString && typeof value === "string")) throw new TypeError("Exact response requires the original numeric token");
    } else if (typeof value === "number" && !Number.isSafeInteger(value)) {
      throw new TypeError("Use decimal text or parseExactJson before binary64 conversion");
    }
    const text = token ? value.value : typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? String(value) : undefined;
    if (text === undefined) throw new TypeError("Invalid exact numeric value");
    if (plan.kind === "count") countFromDecimal(text);
    else integerFromDecimal(text, plan.format);
    if (mode === "body") return plan.allowString && typeof value === "string" ? value : new LosslessNumber(text);
    return text;
  }
  if (isLosslessNumber(value)) return mode === "response" ? Number(value.value) : mode === "url" ? value.value : value;
  if (typeof value === "bigint" && mode === "url") return value.toString();
  if (typeof value === "number" && (mode === "body" || mode === "url") && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new TypeError("Use parseExactJson for numeric tokens outside the safe binary64 integer range");
  // Request values serialize as JSON would: Date and other toJSON objects are not records.
  if (mode !== "response" && value !== null && typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON === "function")
    return walk((value as { toJSON: () => unknown }).toJSON(), plan, mode);
  if (Array.isArray(value)) return value.map(item => walk(item, plan?.items, mode));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) Object.defineProperty(result, key, {
      value: walk(item, plan?.fields && Object.hasOwn(plan.fields, key) ? plan.fields[key] : plan?.values, mode),
      enumerable: true, writable: true, configurable: true,
    });
    return result;
  }
  return value;
}

export const parseExactResponse = (text: string, plan: ExactPlan): unknown => walk(parse(text), plan, "response");

export function mergeExactConfig(base: Record<string, any>, options: Record<string, any> = {}): Record<string, any> {
  const headers = new Headers();
  for (const input of [base.headers, options.headers]) {
    const entries: Array<[string, unknown]> = [];
    if (input instanceof Headers || Array.isArray(input)) {
      const values = input instanceof Headers ? input : new Headers(input);
      values.forEach((value, name) => { entries.push([name, value]); });
    } else entries.push(...Object.entries(input ?? {}));
    for (const [name, value] of entries) {
      if (value === null) headers.delete(name);
      else if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }
  return { ...base, ...options, fetch: options.fetch ?? base.fetch, headers };
}

export function prepareExactRequest(config: Record<string, any>, operation: ExactOperation): Record<string, any> {
  const result: Record<string, any> = {};
  for (const field of ["path", "query"] as const)
    if (config[field]) result[field] = walk(config[field], operation[field], "url");
  let body = operation.body;
  if (body?.selectHeader) body = new Headers(config.headers).has(body.selectHeader) ? body.present : body.absent;
  if (operation.jsonBody) result.bodySerializer = (value: unknown) => {
    const encoded = walk(value, body, "body");
    const serializer = config.bodySerializer;
    // CJS and ESM copies of the pinned client have distinct function identities.
    const standard = serializer === jsonBodySerializer.bodySerializer || typeof serializer === "function" && Function.prototype.toString.call(serializer) === _standardBodySerializerSource;
    if (serializer && !standard && serializer !== stringifyExactJson) {
      const text = serializer(value);
      if (typeof text !== "string") throw new TypeError("Exact JSON requires a text body serializer");
      walk(parse(text), body, "wire");
      return text;
    }
    return stringifyExactJson(encoded);
  };
  // The pinned fetch client parses error JSON independently of parseAs. Adapt its raw
  // text before that JSON.parse so error interceptors also see exact browser strings.
  const fetcher = config.fetch ?? globalThis.fetch;
  result.fetch = async (request: Request) => {
    const response: Response = await fetcher(request);
    const plan = operation.responses[String(response.status)] ?? operation.responses.default;
    if (!response.ok && plan) {
      const read = response.text.bind(response);
      Object.defineProperty(response, "text", { configurable: true, value: async () => {
        const text = await read();
        let parsed: unknown;
        try { parsed = parse(text); } catch { return text; }
        // Lossless stringify keeps opaque numbers numeric; exact fields are already strings.
        return stringifyExactJson(walk(parsed, plan, "response"));
      } });
    }
    return response;
  };
  return result;
}

export async function decodeExactResponse<T extends { data?: unknown; response: Response }>(
  result: T, statuses: Record<string, ExactPlan>, hooks: Record<string, any>,
): Promise<T> {
  const plan = statuses[String(result.response.status)] ?? statuses.default;
  if (!result.response.ok || !plan || result.data === undefined || result.response.status === 204 || result.response.headers.get("Content-Length") === "0") return result;
  if (typeof result.data !== "string") throw new TypeError("Exact responses require the client's text decoder; rounded JSON cannot be repaired");
  let data = parseExactResponse(result.data, plan);
  if (hooks.responseValidator) await hooks.responseValidator(data);
  if (hooks.responseTransformer) data = await hooks.responseTransformer(data);
  return { ...result, data };
}

/** Preserve the transport's conditional throwOnError result type across decoding. */
export function withExactResponse<P extends Promise<{ data?: unknown; response: Response }>>(
  promise: P, statuses: Record<string, ExactPlan>, hooks: Record<string, any>,
): P {
  return promise.then(result => decodeExactResponse(result, statuses, hooks)) as P;
}
