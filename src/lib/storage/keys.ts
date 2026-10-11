// TradeOS — storage keys. A key is ALWAYS built here, on the server, from the
// signed-in user's id and a random name: "<userId>/<uuid>.<ext>". Nothing a user
// typed (file name, path) ever becomes part of a key, and every driver refuses a
// key that does not match this exact shape.

import { randomUUID } from "node:crypto";

export const IMAGE_EXTENSIONS = ["png", "jpg", "webp"] as const;
export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\/[a-f0-9-]{36}\.(png|jpg|webp)$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function newStorageKey(userId: string, ext: ImageExtension): string {
  const key = `${userId}/${randomUUID()}.${ext}`;
  if (!isValidStorageKey(key)) throw new Error("Could not build a storage key.");
  return key;
}
