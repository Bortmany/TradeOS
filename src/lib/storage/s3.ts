// TradeOS — S3-compatible screenshot store (Cloudflare R2 in production).
// The bucket stays private: no public URLs, no signed links. The app reads each
// file itself and streams it to the owner through /api/attachments/[id].

import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { isValidStorageKey } from "./keys";
import type { StorageDriver } from "./types";

export interface S3Settings {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export function readS3Settings(env: NodeJS.ProcessEnv = process.env): S3Settings | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  const region = env.S3_REGION?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !region) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

export function createS3Driver(settings: S3Settings): StorageDriver {
  const client = new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
  const Bucket = settings.bucket;
  const check = (key: string) => {
    if (!isValidStorageKey(key)) throw new Error("Invalid storage key.");
    return key;
  };

  return {
    name: "s3",
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: check(key), Body: bytes, ContentType: contentType })
      );
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: check(key) }));
        if (!out.Body) return null;
        return Buffer.from(await out.Body.transformToByteArray());
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === "NoSuchKey" || name === "NotFound") return null;
        throw err;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: check(key) }));
    },
  };
}
