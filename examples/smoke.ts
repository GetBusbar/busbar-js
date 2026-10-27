// Compile-only example proving the /info response is TYPED as InfoView.
import { createClient, createConfig } from "@hey-api/client-fetch";
import { getApiV1AdminInfo } from "../src";
import type { InfoView } from "../src";

const client = createClient(
  createConfig({
    baseUrl: "http://localhost:8081",
    headers: { "x-admin-token": "YOUR_ADMIN_TOKEN" },
  }),
);

// The generated client types `data` as a union of the response's member types and null, so
// narrow it to InfoView with a guard rather than a cast.
function isInfoView(value: unknown): value is InfoView {
  return typeof value === "object" && value !== null && "topology" in value && "version" in value;
}

export async function main(): Promise<void> {
  const { data, error } = await getApiV1AdminInfo({ client });
  if (error) throw error;
  if (!isInfoView(data)) throw new Error("empty or malformed /info response");
  const info: InfoView = data;              // TYPED — narrowed, no cast
  const version: string = info.version;     // .version is string
  const pools: number = info.topology.pools; // nested typed struct
  console.log(version, pools, info.config_version);
}
