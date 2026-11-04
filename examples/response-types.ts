import { getApiV1AdminInfo, getApiV1AdminPools } from "../src";
import type { InfoView, PoolListView } from "../src";

// Compile-time regressions for the generator/runtime response contract.
export async function responseTypes(): Promise<void> {
  const infoResult = await getApiV1AdminInfo({ throwOnError: true });
  const info: InfoView = infoResult.data;
  const poolsResult = await getApiV1AdminPools({ throwOnError: true });
  const pools: PoolListView = poolsResult.data;
  void info;
  void pools;
}

type Assert<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type InfoData = Awaited<ReturnType<typeof getApiV1AdminInfo>>["data"];
export type InfoResponseRemainsTyped = Assert<
  IsAny<InfoData> extends true ? false : unknown extends InfoData ? false : true
>;

// detail=true can return live member status through the same list operation.
type ListedPoolMember = PoolListView["items"][number]["members"][number];
export type PoolListIncludesLiveMembers = Assert<
  Extract<ListedPoolMember, { usable: boolean }> extends never ? false : true
>;

import {
  postApiV1AdminKeys,
  postApiV1AdminKeysByIdRotate,
  getApiV1AdminHooksByNameStatus,
} from "../src";
import type { CreatedKeyView, HookDesiredStatus } from "../src";

export async function currentResponseTypes(): Promise<void> {
  const created = await postApiV1AdminKeys({ body: { name: "example" }, throwOnError: true });
  const token: string = created.data.token;
  const expiry: number = created.data.expires_at;
  const pools: string[] | null = created.data.allowed_pools;
  const rotated = await postApiV1AdminKeysByIdRotate({ path: { id: "example" }, throwOnError: true });
  const rotatedToken: string | null | undefined = rotated.data.token;
  const legacySecret: string | null | undefined = rotated.data.secret;
  const status = await getApiV1AdminHooksByNameStatus({ path: { name: "example" }, throwOnError: true });
  const keys: string[] = status.data.desired.settings_keys;
  const reportedKeys: string[] | null | undefined = status.data.reported?.settings_keys;
  // @ts-expect-error Valid unrestricted key responses carry null.
  const onlyArray: string[] = created.data.allowed_pools;
  void [token, expiry, pools, rotatedToken, legacySecret, keys, reportedKeys, onlyArray];
}

export type MintDoesNotPromiseLegacySecret = Assert<"secret" extends keyof CreatedKeyView ? false : true>;
export type HookReadsDoNotExposeSettings = Assert<"settings" extends keyof HookDesiredStatus ? false : true>;

import {
  putApiV1AdminExportByName,
  patchApiV1AdminExportByNameSettings,
} from "../src";

export async function namedMutationResponseTypes(): Promise<void> {
  const replaced = await putApiV1AdminExportByName({
    path: { name: "events" },
    body: { module: "file", settings: {} },
    throwOnError: true,
  });
  const replacedPending: string[] | undefined = replaced.data.reload_to_apply;
  const replacedNote: string | null | undefined = replaced.data.note;
  const patched = await patchApiV1AdminExportByNameSettings({
    path: { name: "events" },
    body: { settings: {} },
    throwOnError: true,
  });
  const patchedPending: string[] | undefined = patched.data.reload_to_apply;
  const patchedNote: string | null | undefined = patched.data.note;
  void [replacedPending, replacedNote, patchedPending, patchedNote];
}
