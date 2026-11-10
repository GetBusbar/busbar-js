import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { exactOperations, exactPlan } from "../scripts/exact.mjs";
const require = createRequire(import.meta.url);
const { parseExactResponse, prepareExactRequest } = require("../dist/runtime-exact.gen.js");

export function registerExactTests(sdk, { createClient, createConfig }) {
  test("usage observations preserve exact strings and remain optional", async () => {
    const observation = {
      key_id: "key-1", group: "team", instance: "gateway", destination: "provider",
      serving_subject: "requested-model", rated_subject: "billed-model",
      accounting_time: "18446744073709551615",
      counts: { duration: "170141183460469231731687303715884.105727", requests: "0.000001" },
      spend_micros: "9223372036854775.807",
    };
    for (const present of [true, false]) {
      const payload = {
        window: { start: 0, end: 1 }, as_of: 1, currency: "USD", rate_card_version: null,
        total: { tokens_input: 0, tokens_output: 0, tokens_cache_read: 0, tokens_cache_creation: 0, requests: 0, spend_micros: 0 },
        by_model: [], by_key: [], by_key_truncated: false,
        ...(present ? { observations: [observation] } : {}),
      };
      const client = createClient(createConfig({
        baseUrl: "https://admin.example",
        fetch: async () => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } }),
      }));
      const result = await sdk.getApiV1AdminUsage({ client, throwOnError: true });
      assert.equal(Object.hasOwn(result.data, "observations"), present);
      if (present) assert.deepEqual(result.data.observations, [observation]);
    }
  });

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
    for (const [expires_at, reason] of [[9007199254740992, /before binary64/], ["1.0", /integer token/], ["1e0", /integer token/], ["18446744073709551616", /exceeds u64/], ["-1", /cannot be negative/]])
      await assert.rejects(sdk.postApiV1AdminKeys({ client, body: { name: "key", expires_at } }), reason);
    client.setConfig({ bodySerializer: value => JSON.stringify(value) });
    await assert.rejects(sdk.postApiV1AdminKeys({ client, body: { name: "key", expires_at: 9007199254740992 } }), /before binary64/);
    assert.throws(() => sdk.integerFromDecimal(9007199254740992), /decimal text/);
    assert.throws(() => sdk.countFromDecimal(9007199254740992), /decimal text/);
    assert.equal(calls, 0);
    assert.equal(sdk.integerFromDecimal("18446744073709551615"), "18446744073709551615");
    assert.equal(sdk.integerFromDecimal("-9223372036854775808", "int64"), "-9223372036854775808");
  });

  test("exact-number response decoding refuses invalid tokens and an already-rounded client", async () => {
    const plan = { fields: { value: { kind: "integer", format: "uint64" } } };
    for (const [value, reason] of [["1.0", /integer token/], ["1e0", /integer token/], ["-0", /cannot be negative/], ["-1", /cannot be negative/], ["18446744073709551616", /exceeds u64/], ['"9007199254740993"', /original numeric token/]])
      assert.throws(() => parseExactResponse(`{"value":${value}}`, plan), reason);
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

  test("exact-number adjustment 503 preserves known not-applied effects and recovery headers", async () => {
    const receipt = { operation: "adjust", operation_id: "action-1", actor: "operator", target: "key-1", fingerprint: "request-hash", reason_hash: "reason-hash", effect: "not_applied", applied: false, recovery: "receipt", retry: "same_action_only", count_scale: 6 };
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async () => Response.json(receipt, { status: 503, headers: { "x-busbar-adjust-effect": "not_applied", "x-busbar-receipt-durable": "false" } }) }));
    const result = await sdk.postApiV1AdminAdjust({ client, headers: { "Idempotency-Key": "action-1" }, body: { key: "key-1", lane: "model", entry: "a".repeat(40), card_epoch_ms: "0", reason: "correction", delta: { tokens_input: "-0.000001" } } });
    assert.equal(result.response.status, 503);
    assert.equal(result.error.effect, "not_applied");
    assert.equal(result.error.applied, false);
    assert.equal(result.error.recovery, "receipt");
    assert.equal(result.error.retry, "same_action_only");
    assert.equal(result.response.headers.get("x-busbar-adjust-effect"), "not_applied");
    assert.equal(result.response.headers.get("x-busbar-receipt-durable"), "false");
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

  test("exact-number error bodies keep opaque numbers numeric and never round invalid exact fields", async () => {
    const operation = { responses: { 409: { fields: { retry: { kind: "integer", format: "uint64" } }, values: { raw: true } } } };
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async () => new Response('{"retry":18446744073709551615,"details":{"attempts":5,"ratio":0.5}}', { status: 409, headers: { "content-type": "application/json" } }) }));
    const result = await client.get({ url: "/error", ...prepareExactRequest(client.getConfig(), operation) });
    assert.equal(result.response.status, 409);
    assert.deepEqual(result.error, { retry: "18446744073709551615", details: { attempts: 5, ratio: 0.5 } });
    client.setConfig({ fetch: async () => new Response('{"retry":18446744073709551616}', { status: 409 }) });
    await assert.rejects(client.get({ url: "/error", ...prepareExactRequest(client.getConfig(), operation) }), /exceeds u64/);
  });

  test("exact-number request bodies serialize toJSON values like JSON instead of dropping them", async () => {
    const sent = [];
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => { sent.push(await request.text()); return Response.json({}); } }));
    const when = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    await sdk.patchApiV1AdminExportByNameSettings({ client, path: { name: "metrics" }, body: { settings: { when, nested: { toJSON: () => ({ big: 9007199254740993n }) } } } });
    assert.equal(sent.length, 1);
    assert.equal(sent[0], `{"settings":{"when":"${when.toISOString()}","nested":{"big":9007199254740993}}}`);
  });

  test("exact-number custom body serializers are validated on the wire they produce", async () => {
    let calls = 0;
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async () => { calls++; return Response.json({}); } }));
    client.setConfig({ bodySerializer: value => JSON.stringify(value).replace('"expires_at":"1"', '"expires_at":1.0') });
    await assert.rejects(sdk.postApiV1AdminKeys({ client, body: { name: "key", expires_at: "1" } }), /integer token/);
    client.setConfig({ bodySerializer: () => ({ name: "key" }) });
    await assert.rejects(sdk.postApiV1AdminKeys({ client, body: { name: "key" } }), /text body serializer/);
    assert.equal(calls, 0);
    client.setConfig({ bodySerializer: value => JSON.stringify(value).replace('"expires_at":"1"', '"expires_at":1') });
    await sdk.postApiV1AdminKeys({ client, body: { name: "key", expires_at: "1" }, throwOnError: true });
    assert.equal(calls, 1);
  });

  test("exact-number responses keep prototype-named keys as own data", () => {
    const decoded = parseExactResponse('{"value":1,"__proto__":{"polluted":true},"constructor":2}', { fields: { value: { kind: "integer", format: "uint64" } }, values: {} });
    assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
    assert.equal(Object.hasOwn(decoded, "__proto__"), true);
    assert.equal(decoded.__proto__.polluted, true);
    assert.equal(decoded.constructor, 2);
    assert.equal({}.polluted, undefined);
  });

  test("exact-number union plans take the first matching variant and report the last failure", () => {
    const plan = { fields: { value: { alternatives: [{ kind: "integer", format: "uint64" }, { kind: "count", allowString: true }] } } };
    assert.equal(parseExactResponse('{"value":18446744073709551615}', plan).value, "18446744073709551615");
    assert.equal(parseExactResponse('{"value":-0.5}', plan).value, "-0.5");
    assert.equal(parseExactResponse('{"value":"0.000001"}', plan).value, "0.000001");
    assert.throws(() => parseExactResponse('{"value":0.0000001}', plan), /more than six decimal places/);
    assert.throws(() => parseExactResponse('{"value":true}', plan), /original numeric token/);
  });
}

