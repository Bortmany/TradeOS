// TradeOS — screenshot storage entry point.
//
//   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION all set
//       -> the S3-compatible driver (Cloudflare R2).
//   otherwise, outside production -> the local-disk driver (LOCAL_STORAGE_DIR optional).
//   otherwise (production, nothing configured) -> null: screenshots are "not switched on".
//       Production never silently falls back to a server disk that a redeploy would wipe.

import "server-only";
import { createLocalDriver } from "./local";
import { createS3Driver, readS3Settings } from "./s3";
import type { StorageDriver } from "./types";

export type { StorageDriver } from "./types";
export { newStorageKey, isValidStorageKey } from "./keys";

let cached: { id: string; driver: StorageDriver } | null = null;

export function getStorage(): StorageDriver | null {
  const s3 = readS3Settings();
  if (s3) {
    const id = `s3:${s3.endpoint}:${s3.bucket}`;
    if (cached?.id !== id) cached = { id, driver: createS3Driver(s3) };
    return cached.driver;
  }
  if (process.env.NODE_ENV === "production") return null;
  if (cached?.id !== "local") cached = { id: "local", driver: createLocalDriver() };
  return cached.driver;
}

export function storageEnabled(): boolean {
  return getStorage() !== null;
}
