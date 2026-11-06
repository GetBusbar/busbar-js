import assert from "node:assert/strict";
import test from "node:test";

export function registerRequestTests(sdk, { createClient, createConfig }) {
  test("default usage requests preserve Count decimals before JSON parsing, including custom clients", async () => {
    const { getApiV1AdminUsage } = sdk;
    for (const quantity of ["0.1", "27.5", "9007199254740993", "9223372036854.775807", "170141183460469231731687303715884.105727"]) {
      const client = createClient(createConfig({
        baseUrl: "https://admin.example",
        fetch: async () => new Response(`{"total":{"tokens_input":${quantity},"tokens_output":0,"tokens_cache_read":0,"tokens_cache_creation":0,"requests":1,"spend_micros":27},"by_model":[{"model":"model","provider":"provider","tokens_input":${quantity},"tokens_output":0,"tokens_cache_read":0,"tokens_cache_creation":0,"requests":1,"spend_micros":27,"classes":{"duration":{"count":${quantity},"cost":27}}}],"by_key":[],"rate_card_version":"0000000000000000000000000000000000000001"}`, { headers: { "content-type": "application/json" } }),
      }));
      const result = await getApiV1AdminUsage({ client, parseAs: "json", throwOnError: true });
      assert.equal(result.data.total.tokens_input, quantity);
      assert.equal(result.data.total.tokens_output, "0");
      assert.equal(result.data.by_model[0].tokens_input, quantity);
      assert.equal(result.data.by_model[0].classes.duration.count, quantity);
      assert.equal(result.data.total.requests, "1");
      assert.equal(result.data.total.spend_micros, "27");
      assert.equal(result.data.rate_card_version, "0000000000000000000000000000000000000001");
    }
  });

  test("Count responses preserve configured validation and per-call transformation hooks", async () => {
    const seen = [];
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      fetch: async () => new Response('{"total":{"tokens_input":9007199254740993}}', { headers: { "content-type": "application/json" } }),
      responseValidator: async data => { seen.push(["validate", data.total.tokens_input]); },
      responseTransformer: async () => { throw new Error("per-call transformer must override client config"); },
    }));
    const result = await sdk.getApiV1AdminUsage({ client, responseTransformer: async data => {
      seen.push(["transform", data.total.tokens_input]);
      return { ...data, transformed: true };
    } });
    assert.deepEqual(seen, [["validate", "9007199254740993"], ["transform", "9007199254740993"]]);
    assert.equal(result.data.transformed, true);
    client.setConfig({ responseValidator: async () => { throw new Error("validation refused"); } });
    await assert.rejects(sdk.getApiV1AdminUsage({ client }), /validation refused/);
  });

  test("usage Count errors reject inexact values and retain HTTP error envelopes", async () => {
    const { getApiV1AdminUsage } = sdk;
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      fetch: async () => new Response('{"total":{"tokens_input":0.0000001}}', { headers: { "content-type": "application/json" } }),
    }));
    await assert.rejects(getApiV1AdminUsage({ client }), /six decimal places/);
    for (const status of [400, 401, 403, 503]) {
      const error = { error: { code: status === 503 ? "unavailable" : "invalid_request", message: "refused" } };
      client.setConfig({ fetch: async () => Response.json(error, { status }) });
      const result = await getApiV1AdminUsage({ client });
      assert.equal(result.response.status, status);
      assert.deepEqual(result.error, error);
    }
  });

  test("key and group usage preserve Count and integer tokens while ratios remain numeric", async () => {
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      fetch: async request => new Response(request.url.includes("/groups/")
        ? '{"name":"group","as_of":1,"buckets":[{"window":"total","tokens":9007199254740993.125,"requests":1,"spend_cents":2,"tokens_cap":42}]}'
        : '{"id":"key","budget_period":"total","window_start":0,"as_of":1,"group":null,"tokens":27.5,"requests":1,"spend_cents":2,"rate_headroom":0.25}',
      { headers: { "content-type": "application/json" } }),
    }));
    const key = await sdk.getApiV1AdminKeysByIdUsage({ client, path: { id: "key" }, throwOnError: true });
    assert.equal(key.data.tokens, "27.5");
    assert.equal(key.data.rate_headroom, 0.25);
    const group = await sdk.getApiV1AdminGroupsByNameUsage({ client, path: { name: "group" }, throwOnError: true });
    assert.equal(group.data.buckets[0].tokens, "9007199254740993.125");
    assert.equal(group.data.buckets[0].tokens_cap, "42");
  });

  test("SDK sends the configured credential and parses the response", async () => {
    const { getApiV1AdminInfo } = sdk;
    const expected = { version: "test", topology: { pools: 2 } };
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      headers: { "x-admin-token": "test-token" },
      fetch: async (request) => {
        assert.equal(request.url, "https://admin.example/api/v1/admin/info");
        assert.equal(request.headers.get("x-admin-token"), "test-token");
        return Response.json(expected);
      },
    }));
    const { data } = await getApiV1AdminInfo({ client, throwOnError: true });
    assert.deepEqual(data, { ...expected, topology: { pools: "2" } });
  });

  test("mint and hook updates serialize JSON bodies with path and concurrency headers", async () => {
    const { postApiV1AdminKeys, patchApiV1AdminHooksByNameSettings } = sdk;
    const requests = [];
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      fetch: async (request) => {
        requests.push({
          method: request.method,
          url: request.url,
          contentType: request.headers.get("content-type"),
          ifMatch: request.headers.get("if-match"),
          body: await request.json(),
        });
        return Response.json({ token: "minted-token", expires_at: 123, allowed_pools: null });
      },
    }));
    const minted = await postApiV1AdminKeys({ client, body: { name: "example", allowed_pools: null }, throwOnError: true });
    assert.equal(minted.data.token, "minted-token");
    assert.equal(minted.data.allowed_pools, null);
    await patchApiV1AdminHooksByNameSettings({
      client,
      path: { name: "example hook" },
      headers: { "If-Match": '"v1"' },
      body: { settings: { enabled: true } },
      throwOnError: true,
    });
    assert.deepEqual(requests, [
      {
        method: "POST",
        url: "https://admin.example/api/v1/admin/keys",
        contentType: "application/json",
        ifMatch: null,
        body: { name: "example", allowed_pools: null },
      },
      {
        method: "PATCH",
        url: "https://admin.example/api/v1/admin/hooks/example%20hook/settings",
        contentType: "application/json",
        ifMatch: '"v1"',
        body: { settings: { enabled: true } },
      },
    ]);
  });

  test("mutation errors preserve the server error envelope", async () => {
    const { postApiV1AdminKeys } = sdk;
    const error = { error: { code: "invalid_request", message: "invalid name" } };
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      fetch: async () => Response.json(error, { status: 400 }),
    }));
    const result = await postApiV1AdminKeys({ client, body: { name: "" } });
    assert.equal(result.data, undefined);
    assert.deepEqual(result.error, error);
    await assert.rejects(
      postApiV1AdminKeys({ client, body: { name: "" }, throwOnError: true }),
      (actual) => { assert.deepEqual(actual, error); return true; },
    );
  });

  test("per-call header forms preserve credentials, idempotency and caller content type", async () => {
    const { postApiV1AdminKeys, getApiV1AdminInfo } = sdk;
    const entries = [
      ["x-admin-token", "per-call-token"],
      ["Idempotency-Key", "retry-key"],
      ["Content-Type", "application/json; charset=utf-8"],
      ["__proto__", "required-value"],
    ];
    for (const headers of [new Headers(entries), entries, Object.fromEntries(entries)]) {
      const seen = [];
      const client = createClient(createConfig({
        baseUrl: "https://admin.example",
        fetch: async (request) => {
          seen.push({
            proto: request.headers.get("__proto__"),
            token: request.headers.get("x-admin-token"),
            idempotency: request.headers.get("idempotency-key"),
            contentType: request.headers.get("content-type"),
          });
          return Response.json({});
        },
      }));
      await postApiV1AdminKeys({ client, body: { name: "example" }, headers });
      await getApiV1AdminInfo({ client, headers });
      assert.deepEqual(seen, [
        { proto: "required-value", token: "per-call-token", idempotency: "retry-key", contentType: "application/json; charset=utf-8" },
        { proto: "required-value", token: "per-call-token", idempotency: "retry-key", contentType: null },
      ]);
    }
  });

  test("object header deletion and multi-value semantics survive normalization", async () => {
    const { postApiV1AdminKeys } = sdk;
    let calls = 0;
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      headers: { "x-remove": "configured" },
      fetch: async (request) => {
        calls++;
        assert.equal(request.headers.get("x-remove"), null);
        assert.equal(request.headers.get("x-trace"), "first, second");
        assert.equal(request.headers.get("content-type"), "application/json");
        return Response.json({});
      },
    }));
    await postApiV1AdminKeys({
      client,
      body: { name: "example" },
      headers: { "x-remove": null, "x-trace": ["first", "second"] },
      throwOnError: true,
    });
    assert.equal(calls, 1);
  });
}
