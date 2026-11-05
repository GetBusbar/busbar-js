import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { countOperations } from "../scripts/counts.mjs";
const { countFromDecimal, decodeCountResponse, parseCountResponse } = createRequire(import.meta.url)("../dist/runtime-counts.gen.js");

const plan = { fields: { tokens: { count: true }, rows: { items: { fields: { count: { count: true } } } }, classes: { values: { fields: { count: { count: true } } } } } };

test("Count decoding preserves fractional, large and scale-6 boundary numeric wire text", () => {
  for (const count of ["0.1", "27.5", "9007199254740993", "9223372036854.775807", "170141183460469231731687303715884.105727", "-170141183460469231731687303715884.105728", "0.000001", "1e-6", "1e-0", "1.0000000"]) {
    const decoded = parseCountResponse(`{"tokens":${count},"rows":[{"count":${count}}],"classes":{"duration":{"count":${count}}},"rate_headroom":0.5,"requests":3}`, plan);
    assert.equal(decoded.tokens, count);
    assert.equal(decoded.rows[0].count, count);
    assert.equal(decoded.classes.duration.count, count);
    assert.equal(decoded.rate_headroom, 0.5);
    assert.equal(decoded.requests, 3);
  }
});

test("Count rejects unrepresentable precision, magnitude and nonnumeric wire values", () => {
  for (const text of ["0.0000001", "1e-7", "170141183460469231731687303715884.105728", "-170141183460469231731687303715884.105729", "1e100000000", "NaN", "Infinity", "+1", "01", ".5"]) {
    assert.throws(() => countFromDecimal(text), { name: /TypeError|RangeError/ });
  }
  for (const wire of ['"0.1"', "null", "true", "{}"])
    assert.throws(() => parseCountResponse(`{"tokens":${wire}}`, plan), /nonnumeric Count/);
  assert.equal(countFromDecimal("0e1000000000000000000000000000000000000000000"), "0");
});

test("Count decoder leaves error envelopes alone and refuses a client that already rounded JSON", async () => {
  const failed = { error: { error: { code: "unauthorized" } }, response: new Response("", { status: 401 }) };
  assert.equal(await decodeCountResponse(failed, { 200: plan }), failed);
  await assert.rejects(decodeCountResponse({ data: { tokens: 0.1 }, response: new Response() }, { 200: plan }), /text response decoder/);
});

test("Count response reconstruction preserves ordinary prototype-named keys as data", () => {
  const decoded = parseCountResponse('{"tokens":0.1,"__proto__":{"polluted":true},"constructor":2}', plan);
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.hasOwn(decoded, "__proto__"), true);
  assert.equal(decoded.__proto__.polluted, true);
  assert.equal(decoded.constructor, 2);
  assert.equal({}.polluted, undefined);
});

test("generator derives Count paths only from annotations, preserving unrelated numeric fields", () => {
  const specification = { components: { schemas: { Usage: { type: "object", properties: { count: { type: "number", "x-busbar-count-scale": 6 }, rate: { type: "number" } } } } }, paths: { "/usage": { get: { responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Usage" } } } } } } } } };
  assert.deepEqual(countOperations(specification).get("GET /usage"), { 200: { fields: { count: { count: true } } } });
  specification.components.schemas.Usage.properties.count["x-busbar-count-scale"] = 7;
  assert.throws(() => countOperations(specification), /unsupported Count scale/);
});
