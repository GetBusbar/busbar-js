# @busbar/busbar-admin (TypeScript SDK)

[![CI](https://github.com/GetBusbar/busbar-js/actions/workflows/ci.yml/badge.svg)](https://github.com/GetBusbar/busbar-js/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/GetBusbar/busbar-js/branch/main/graph/badge.svg)](https://codecov.io/gh/GetBusbar/busbar-js)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A typed TypeScript client for the **Busbar Admin API** (`/api/v1/admin`).

Generated from the typed OpenAPI 3.1 schema in [`openapi.json`](./openapi.json)
with [`@hey-api/openapi-ts`](https://heyapi.dev) + `@hey-api/client-fetch`, so
every response is a real interface (`InfoView`, `TopologyInfo`, ...) — not
`unknown`/`any`.

## Versioning

- **SDK version:** `0.4.0`. The SDK carries its own semantic version, independent of
  the busbar server it talks to.
- **Generated from:** busbar OpenAPI `info.version` `1.5.3`, the bundled
  [`openapi.json`](./openapi.json).

It targets the frozen, additive-only `/api/v1/admin` surface.

Neither number above is maintained by hand alone: CI runs
`.github/check-readme-versions.py`, which fails the build if this section stops matching
`package.json` and `openapi.json`. They went stale silently once, so now they cannot.

### History

`0.2.0` was the breaking release: the busbar `1.5.0` spec added `operationId`s, which
renamed every generated function.

## Install

```bash
npm install @busbar/busbar-admin
```

## Usage

The admin API authenticates with an `x-admin-token` header. Create a client with
your endpoint and token, then call `GET /info` (see
[`examples/smoke.ts`](./examples/smoke.ts)):

```ts
import { createClient, createConfig } from "@hey-api/client-fetch";
import { getInfo } from "@busbar/busbar-admin";
import type { InfoView } from "@busbar/busbar-admin";

const client = createClient(
  createConfig({
    baseUrl: "http://localhost:8081",
    headers: { "x-admin-token": "YOUR_ADMIN_TOKEN" },
  }),
);

const { data, error } = await getInfo({ client });
if (error) throw error;

// `data` is TYPED as InfoView — editor autocompletes .version, .topology, .build, ...
const info: InfoView = data;
console.log("busbar version:", info.version);          // -> "1.5.3"
console.log("pools:", info.topology.pools);
console.log("config version:", info.config_version);
```

> Prefer `Authorization: Bearer`? Set `headers: { Authorization: "Bearer YOUR_ADMIN_TOKEN" }`
> instead — the admin API accepts either.

## Regenerating the client

The committed client under [`src/`](./src) is generated from `openapi.json`. To
re-derive it:

```bash
npm ci
npm run generate     # runs openapi-ts against ./openapi.json
```

The generator and TypeScript versions are pinned in `package.json`
(`@hey-api/openapi-ts@0.64.15`, `typescript@5.7.3` — TS 7 previews crash the
generator). CI regenerates on every PR/push and fails if the committed client
drifts (`git diff --exit-code`).

## License

Apache-2.0 © Busbar, Inc.
