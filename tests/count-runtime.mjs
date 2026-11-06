import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { countFromDecimal } = createRequire(import.meta.url)("../dist/runtime-counts.gen.js");

test("Count validation accepts fractional, large and scale-6 boundary numeric wire text unchanged", () => {
  for (const count of ["0.1", "27.5", "9007199254740993", "9223372036854.775807", "170141183460469231731687303715884.105727", "-170141183460469231731687303715884.105728", "0.000001", "1e-6", "1e-0", "1.0000000"])
    assert.equal(countFromDecimal(count), count);
});

test("Count rejects unrepresentable precision, magnitude and nonnumeric wire values", () => {
  for (const text of ["0.0000001", "1e-7", "170141183460469231731687303715884.105728", "-170141183460469231731687303715884.105729", "1e100000000", "NaN", "Infinity", "+1", "01", ".5"]) {
    assert.throws(() => countFromDecimal(text), { name: /TypeError|RangeError/ });
  }
  assert.equal(countFromDecimal("0e1000000000000000000000000000000000000000000"), "0");
});
