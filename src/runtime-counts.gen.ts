// Generated from runtime/counts.ts by scripts/generate.mjs.
import { isLosslessNumber, parse } from "lossless-json";

/** Exact decimal text in the SDK; the Admin API sends Count as a JSON number. */
export type Count = string;

export interface CountPlan {
  count?: true;
  fields?: Record<string, CountPlan>;
  items?: CountPlan;
  values?: CountPlan;
}

/** Validate scale 6 and the signed i128 mantissa without converting through a float. */
export function countFromDecimal(text: string): Count {
  if (typeof text !== "string") throw new TypeError("Count requires decimal text before numeric conversion");
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new TypeError("Count must be decimal JSON number text");
  const digits = (match[2] + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  const exponentText = match[4] ?? "0";
  if (exponentText.replace(/^[+-]?0*/, "").length > 8)
    throw new RangeError("Count is outside the exact scale-6 range");
  const shift = 6 + Number(exponentText) - (match[3]?.length ?? 0);
  let scaled: string;
  if (shift < 0) {
    const end = digits.length + shift;
    if (end < 0 || /[1-9]/.test(digits.slice(end)))
      throw new RangeError("Count has more than six decimal places");
    scaled = digits.slice(0, end) || "0";
  } else {
    if (digits.length + shift > 39)
      throw new RangeError("Count is outside the exact scale-6 range");
    scaled = digits + "0".repeat(shift);
  }
  if (scaled.length > 39) throw new RangeError("Count is outside the exact scale-6 range");
  const mantissa = BigInt((match[1] || "") + scaled);
  if (mantissa < -(1n << 127n) || mantissa > (1n << 127n) - 1n)
    throw new RangeError("Count is outside the exact scale-6 range");
  return text;
}

/** Only schema-annotated quantities become Count strings; other fields keep their API types. */
export function parseCountResponse(text: string, plan: CountPlan): unknown {
  function restore(value: unknown, current?: CountPlan): unknown {
    if (current?.count) {
      if (!isLosslessNumber(value)) throw new TypeError("The API returned a nonnumeric Count");
      return countFromDecimal(value.value);
    }
    if (isLosslessNumber(value)) return Number(value.value);
    if (Array.isArray(value)) return value.map(item => restore(item, current?.items));
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        Object.defineProperty(result, key, {
          value: restore(item, current?.fields && Object.hasOwn(current.fields, key) ? current.fields[key] : current?.values),
          enumerable: true, writable: true, configurable: true,
        });
      }
      return result;
    }
    return value;
  }
  return restore(parse(text), plan);
}

/** Generated methods force text decoding before this seam, including on caller-owned clients. */
export async function decodeCountResponse<T extends { data?: unknown; response: Response }>(
  result: T,
  statuses: Record<string, CountPlan>,
  hooks: { responseValidator?: (data: unknown) => Promise<unknown>; responseTransformer?: (data: unknown) => Promise<unknown> } = {},
): Promise<T> {
  const plan = statuses[String(result.response.status)];
  if (!result.response.ok || !plan || result.data === undefined) return result;
  if (typeof result.data !== "string")
    throw new TypeError("Count responses require the client's text response decoder");
  let data = parseCountResponse(result.data, plan);
  if (hooks.responseValidator) await hooks.responseValidator(data);
  if (hooks.responseTransformer) data = await hooks.responseTransformer(data);
  return { ...result, data };
}
