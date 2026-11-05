import {
  putApiV1AdminAdminAuth,
  postApiV1AdminAuthCacheFlush,
  postApiV1AdminConfigApply,
  postApiV1AdminConfigRollback,
  postApiV1AdminConfigValidate,
  postApiV1AdminHooks,
  putApiV1AdminHooksByName,
  patchApiV1AdminHooksByNameSettings,
  postApiV1AdminKeys,
  patchApiV1AdminKeysById,
} from "../src";

// Compile-only contract regressions for request bodies accepted by the server.
export async function requestTypes(): Promise<void> {
  await putApiV1AdminAdminAuth({ body: { admin_auth: ["admin-tokens"] } });
  await postApiV1AdminAuthCacheFlush({ body: { module: "example" } });
  // An absent body flushes every credential-cache partition.
  await postApiV1AdminAuthCacheFlush({});
  await postApiV1AdminConfigApply({ body: { config: {} }, headers: { "If-Match": '"v1"' } });
  await postApiV1AdminConfigRollback({ body: { version: "1" } });
  await postApiV1AdminConfigValidate({ body: { config: {}, providers: {} } });
  await postApiV1AdminHooks({ body: { name: "example", config: { kind: "tap", module: "example" } } });
  await putApiV1AdminHooksByName({ path: { name: "example" }, body: { config: { kind: "tap", module: "example" } } });
  await patchApiV1AdminHooksByNameSettings({ path: { name: "example" }, body: { settings: {} } });
  await postApiV1AdminKeys({ body: { name: "example", allowed_pools: null } });
  await patchApiV1AdminKeysById({ path: { id: "example" }, body: { enabled: false, group: null } });

  await postApiV1AdminKeys({ body: { name: "example" }, headers: new Headers({ "Idempotency-Key": "retry-key" }) });
  await postApiV1AdminKeys({ body: { name: "example" }, headers: [["Idempotency-Key", "retry-key"]] });

  // @ts-expect-error Applying config requires a body.
  await postApiV1AdminConfigApply({});
  // @ts-expect-error The mint contract requires a name.
  await postApiV1AdminKeys({ body: {} });
  // @ts-expect-error Legacy inline key limits are no longer accepted by the server.
  await postApiV1AdminKeys({ body: { name: "example", rpm_limit: 10 } });
}
