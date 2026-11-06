// Generated from runtime/counts.ts by scripts/generate.mjs.
/** Exact decimal text in the SDK; the Admin API sends Count as a JSON number. */
export type Count = string;

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
