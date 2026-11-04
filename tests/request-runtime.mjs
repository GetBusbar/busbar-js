import assert from "node:assert/strict";
import test from "node:test";

export function registerRequestTests(sdk, { createClient, createConfig }) {
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
    assert.deepEqual(data, expected);
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
    const client = createClient(createConfig({
      baseUrl: "https://admin.example",
      headers: { "x-remove": "configured" },
      fetch: async (request) => {
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
    });
  });
}
