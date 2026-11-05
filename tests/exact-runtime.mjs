import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { exactOperations, exactPlan } from "../scripts/exact.mjs";
const require = createRequire(import.meta.url);
const { parseExactResponse, prepareExactRequest } = require("../dist/runtime-exact.gen.js");

export function registerExactTests(sdk, { createClient, createConfig }) {
  test("exact-number profile drives all annotated integer and decimal response plans", () => {
    const spec = JSON.parse(readFileSync(new URL("../openapi.json", import.meta.url)));
    assert.equal(spec["x-busbar-exact-numbers"].profile, "lossless-number-token-v1");
    assert.equal(spec["x-busbar-settings-profile"], "integer-token-v1");
    const plans = exactOperations(spec);
    assert.equal(plans.size, 103);
    assert(plans.get("GET /api/v1/admin/info").responses[200].fields.config_version);
    assert.equal(spec.components.schemas.CreatedKeyView.properties.expires_at.type, "integer");
    assert.equal(spec.components.schemas.ClassUsage.properties.count.type, "number");
    const typed = exactPlan(spec.components.schemas.CreatedKeyView, spec);
    assert.equal(typed.fields.expires_at.format, "uint64");
  });

  test("exact-number u64 responses retain numeric wire text before binary64 including custom hooks", async () => {
    const seen = [];
    const client = createClient(createConfig({ baseUrl: "https://admin.example",
      fetch: async () => new Response('{"config_version":18446744073709551615,"started_at":9007199254740993,"uptime_seconds":0}', { headers: { "content-type": "application/json" } }),
      responseValidator: async value => { seen.push(value.config_version); },
    }));
    const result = await sdk.getApiV1AdminInfo({ client, parseAs: "json", throwOnError: true });
    assert.equal(result.data.config_version, "18446744073709551615");
    assert.equal(result.data.started_at, "9007199254740993");
    assert.equal(result.data.uptime_seconds, "0");
    assert.deepEqual(seen, ["18446744073709551615"]);
  });

  test("exact-number requests preserve numeric u64 i64 and header-selected decimal-string wire forms", async () => {
    const requests = [];
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
      requests.push({ text: await request.text(), key: request.headers.get("Idempotency-Key") });
      return Response.json({});
    } }));
    const common = { key: "key", lane: "model", entry: "a".repeat(40), card_epoch_ms: "18446744073709551615", reason: "correction", pool: "default" };
    await sdk.postApiV1AdminAdjust({ client, body: { ...common, delta: { tokens_input: "-9223372036854775808" } } });
    assert.match(requests[0].text, /"card_epoch_ms":18446744073709551615/);
    assert.match(requests[0].text, /"tokens_input":-9223372036854775808/);
    assert.equal(requests[0].key, null);
    client.setConfig({ headers: { "Idempotency-Key": "exact-action" } });
    await sdk.postApiV1AdminAdjust({ client, headers: new Headers({ "X-Call": "kept" }), body: { ...common, delta: { tokens_input: "-0.000001" } } });
    assert.equal(requests[1].key, "exact-action");
    assert.match(requests[1].text, /"tokens_input":"-0.000001"/);
    assert.match(requests[1].text, /"card_epoch_ms":18446744073709551615/);
  });

  test("exact-number requests reject rounded numbers invalid integer spelling and range before fetch", async () => {
    let calls = 0;
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async () => { calls++; return Response.json({}); } }));
    for (const expires_at of [9007199254740992, "1.0", "1e0", "18446744073709551616", "-1"])
      await assert.rejects(sdk.postApiV1AdminKeys({ client, body: { name: "key", expires_at } }));
    client.setConfig({ bodySerializer: value => JSON.stringify(value) });
    await assert.rejects(sdk.postApiV1AdminKeys({ client, body: { name: "key", expires_at: 9007199254740992 } }));
    assert.throws(() => sdk.integerFromDecimal(9007199254740992), /decimal text/);
    assert.throws(() => sdk.countFromDecimal(9007199254740992), /decimal text/);
    assert.equal(calls, 0);
    assert.equal(sdk.integerFromDecimal("18446744073709551615"), "18446744073709551615");
    assert.equal(sdk.integerFromDecimal("-9223372036854775808", "int64"), "-9223372036854775808");
  });

  test("exact-number response decoding refuses invalid tokens and an already-rounded client", async () => {
    const plan = { fields: { value: { kind: "integer", format: "uint64" } } };
    for (const value of ["1.0", "1e0", "-0", "-1", "18446744073709551616", '"9007199254740993"'])
      assert.throws(() => parseExactResponse(`{"value":${value}}`, plan));
    assert.equal(parseExactResponse('{"value":18446744073709551615}', plan).value, "18446744073709551615");
    const client = { getConfig: () => ({}), get: async () => ({ data: { config_version: 9007199254740992 }, response: Response.json({}) }) };
    await assert.rejects(sdk.getApiV1AdminInfo({ client }), /text decoder|rounded JSON/);
  });

  test("exact-number errors reach interceptors without binary64 conversion and keep HTTP context", async () => {
    const seen = [];
    const operation = { responses: { 409: { fields: { retry: { kind: "integer", format: "uint64" } } } } };
    const config = createConfig({ baseUrl: "https://admin.example", fetch: async () => new Response('{"retry":18446744073709551615,"error":{"code":"future_code","message":"retry later"}}', { status: 409, headers: { "content-type": "application/json", "x-context": "kept" } }) });
    const client = createClient(config);
    client.interceptors.error.use(value => { seen.push(value.retry); return value; });
    const result = await client.get({ url: "/error", ...prepareExactRequest(client.getConfig(), operation) });
    assert.equal(result.response.status, 409);
    assert.equal(result.response.headers.get("x-context"), "kept");
    assert.equal(result.error.retry, "18446744073709551615");
    assert.deepEqual(seen, ["18446744073709551615"]);
  });

  test("exact-number empty successes and transport errors preserve HTTP behavior", async () => {
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async () => new Response(null, { status: 204, headers: { "x-context": "kept" } }) }));
    const removed = await sdk.deleteApiV1AdminKeysById({ client, fetch: undefined, path: { id: "key" }, throwOnError: true });
    assert.equal(removed.response.status, 204);
    assert.equal(removed.response.headers.get("x-context"), "kept");
    assert.deepEqual(removed.data, {});
    for (const body of ["", "<html>upstream unavailable</html>"]) {
      client.setConfig({ fetch: async () => new Response(body, { status: 503 }) });
      const failed = await sdk.postApiV1AdminKeys({ client, body: { name: "key" } });
      assert.equal(failed.response.status, 503);
      assert.deepEqual(failed.error, body || {});
    }
  });

  test("exact settings JSON codec preserves unsigned signed decimal and exponent tokens on wire", async () => {
    const input = '{"document_patch":{"set":{"/example/u":18446744073709551615,"/example/i":-9223372036854775808,"/example/decimal":1.0,"/example/exponent":1e0}}}';
    const body = sdk.parseExactJson(input);
    assert.equal(sdk.stringifyExactJson(body), input);
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
      assert.equal(await request.text(), input);
      return Response.json({ error: { code: "invalid_request", message: "integer token required" } }, { status: 400 });
    } }));
    const result = await sdk.putApiV1AdminConfigSettings({ client, body });
    assert.equal(result.response.status, 400);
    assert.equal(result.error.error.code, "invalid_request");
  });
}
