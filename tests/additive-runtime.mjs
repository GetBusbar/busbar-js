import assert from "node:assert/strict";
import test from "node:test";

export function registerAdditiveTests(sdk, { createClient, createConfig }) {
  test("linked plugin discovery preserves ownership metadata and explicit schema source", async () => {
    const configuration = {
      root_keys: ["llm"], root_source: "statement", declaration_source: "linked_statement",
      declaration_availability: "present",
      sections: [{ name: "llm", declaring: true, consumed: false, required: true, selects: true }],
      claims: [], settings_schema_scope: "lifecycle_settings", input_schema_complete: false,
      configuration_shape: "declared_sections", host_policy_paths: [],
    };
    const plugin = { name: "llm", type: "plane", loader: "compiled-in", active: null,
      target: "llm", has_schema: true, configuration,
      schema_url: "/api/v1/admin/plugins/llm/schema?source=linked_statement" };
    const schema = { name: "llm", schema: { type: "object" }, schema_error: null,
      trust: "trusted", source: "statement", configuration };
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
      const url = new URL(request.url);
      assert.equal(request.method, "GET");
      if (url.pathname === "/api/v1/admin/plugins") {
        assert.equal(url.searchParams.get("type"), "plane");
        return Response.json({ items: [plugin], next_cursor: null });
      }
      assert.equal(url.pathname, "/api/v1/admin/plugins/llm/schema");
      assert.equal(url.searchParams.get("source"), "linked_statement");
      assert.equal(url.searchParams.has("expected_archive_sha256"), false);
      return Response.json(schema);
    } }));
    const inventory = await sdk.getApiV1AdminPlugins({ client, query: { type: "plane" }, throwOnError: true });
    assert.deepEqual(inventory.data.items[0].configuration, configuration);
    assert.equal(inventory.data.items[0].configuration.input_schema_complete, false);
    const result = await sdk.getApiV1AdminPluginsByFileSchema({ client, path: { file: "llm" },
      query: { source: "linked_statement" }, throwOnError: true });
    assert.deepEqual(result.data, schema);
    client.setConfig({ fetch: async () => Response.json({ ...schema, configuration: null }) });
    const absent = await sdk.getApiV1AdminPluginsByFileSchema({ client, path: { file: "legacy" }, throwOnError: true });
    assert.equal(absent.data.configuration, null);
  });

  test("telemetry preserves exact string counters, nullable bounds and native error envelopes", async () => {
    const expected = {
      process_boot_nonce: "0123456789abcdef0123456789abcdef", uptime_since_start_ms: "9007199254740993",
      captured_at_unix_ms: "1793836800123", upper_bounds_ms: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, null],
      identities: [{ plane: "llm", phase: "LlmProducerDrive", pool: "default", ingress_protocol: "openai",
        count: "9007199254740993", errors: "1", client_errors: "2", sum_us: "18446744073709551615", bins: ["0", "0", "0", "0", "0", "0", "9007199254740993", "0", "0", "0", "0", "0", "0", "0", "0", "0"] }],
      omitted_identities: "0", truncated: false,
      dropped: { invalid_duration: "0", integer_overflow: "0", series_capacity: "0", boot_nonce_unavailable: "0", histogram_capacity: "0", unregistered_labels: "0" },
    };
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
      assert.equal(request.method, "GET");
      assert.equal(new URL(request.url).pathname, "/api/v1/admin/telemetry");
      return Response.json(expected);
    } }));
    const result = await sdk.getApiV1AdminTelemetry({ client, throwOnError: true });
    assert.deepEqual(result.data, { ...expected, upper_bounds_ms: expected.upper_bounds_ms.map(bound => bound === null ? null : String(bound)) });
    for (const status of [401, 503]) {
      const error = { error: { code: status === 401 ? "unauthorized" : "unavailable", message: "collection unavailable" } };
      client.setConfig({ fetch: async () => Response.json(error, { status }) });
      const failed = await sdk.getApiV1AdminTelemetry({ client });
      assert.equal(failed.response.status, status);
      assert.deepEqual(failed.error, error);
    }
  });

  test("config union modes preserve document, catalog and legacy request bodies and responses", async () => {
    const cases = [
      { body: { limits: { request_body_max_bytes: 5000123 } }, response: { applied: true, config_version: 8, settings: { limits: { request_body_max_bytes: 5000123 } }, reload_to_apply: [] } },
      { body: { document_patch: { set: { "/limits/request_body_max_bytes": 5000123, "/rate_card/llm/input": 0.125, "/tls": null }, remove: ["/providers/retired"] }, providers_patch: { set: { "/example/base_url": "https://api.example.com" } }, reset_document_paths: ["/limits"], reset_providers_paths: ["/example"] }, response: { applied: true, persisted: true, config_version: 9, configuration: { config_version: 9, state: "restart_pending", source: "installed_generation", config_locked: false, values: { limits: { request_body_max_bytes: 5000123 } }, reload_to_apply: ["listen"] }, reload_to_apply: ["listen"] } },
    ];
    for (const { body, response } of cases) {
      const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
        assert.equal(request.method, "PUT");
        assert.equal(new URL(request.url).pathname, "/api/v1/admin/config/settings");
        assert.equal(request.headers.get("If-Match"), '"7"');
        assert.deepEqual(await request.json(), body);
        return Response.json(response);
      } }));
      const result = await sdk.putApiV1AdminConfigSettings({ client, body, headers: { "If-Match": '"7"' }, throwOnError: true });
      assert.equal(result.data.config_version, String(response.config_version));
      assert.deepEqual(result.data.reload_to_apply, response.reload_to_apply);
      if (response.configuration) {
        assert.equal(result.data.configuration.config_version.value, "9");
        assert.equal(result.data.configuration.values.limits.request_body_max_bytes.value, "5000123");
      } else {
        assert.equal(result.data.settings.limits.request_body_max_bytes.value, "5000123");
      }
    }
  });

  test("canonical hook readback preserves replacement inputs", async () => {
    for (const on_empty of [null, "first"]) {
      const expected = { name: "ranking", kind: "gate", transport: { kind: "none", target: null }, prompt: "no", user: "no", priority: 0, on_error: "reject", on_empty, signals: ["requested_model", "latency"], default: true, timeout_ms: 1000, settings_keys: [], global: false, phase: ["routing"], fires_at: ["routing"], groups: [] };
      const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
        assert.equal(request.method, "GET");
        assert.equal(new URL(request.url).pathname, "/api/v1/admin/hooks");
        return Response.json({ items: [expected], next_cursor: null });
      } }));
      const result = await sdk.getApiV1AdminHooks({ client, throwOnError: true });
      const hook = result.data.items[0];
      for (const key of ["on_empty", "signals", "default", "phase", "fires_at"]) assert.deepEqual(hook[key], expected[key]);
    }
  });

  test("named settings edit preserves explicit null, removal and omitted secret semantics on wire", async () => {
    const body = { edit: { set: { endpoint: "https://collector.example", optional: null }, remove: ["obsolete"] } };
    const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
      assert.equal(request.method, "PATCH");
      assert.equal(new URL(request.url).pathname, "/api/v1/admin/export/metrics/settings");
      const sent = await request.json();
      assert.deepEqual(sent, body);
      assert.equal(Object.hasOwn(sent.edit.set, "secret"), false);
      return Response.json({ name: "metrics", module: "prometheus", settings_keys: ["endpoint", "optional", "secret"], configuration: { config_version: 9, source: "installed_configuration", state: "configured", settings_public: { endpoint: "https://collector.example" } } });
    } }));
    const result = await sdk.patchApiV1AdminExportByNameSettings({ client, path: { name: "metrics" }, body, throwOnError: true });
    assert.equal(result.data.configuration.settings_public.endpoint, "https://collector.example");
  });

  test("trust digest precondition is optional on wire and conflict responses remain typed", async () => {
    for (const operation of ["Approve", "Revoke"]) {
      for (const expected_digest of [undefined, "reviewed-digest"]) {
        const body = { key: "instance/peer", ...(expected_digest === undefined ? {} : { expected_digest }) };
        const error = { error: { code: "conflict", message: "sighting changed" } };
        const client = createClient(createConfig({ baseUrl: "https://admin.example", fetch: async request => {
          assert.equal(new URL(request.url).pathname, `/api/v1/admin/trust/${operation.toLowerCase()}`);
          assert.deepEqual(await request.json(), body);
          return Response.json(error, { status: 409 });
        } }));
        const result = await sdk[`postApiV1AdminTrust${operation}`]({ client, body });
        assert.equal(result.response.status, 409);
        assert.deepEqual(result.error, error);
      }
    }
  });
}
