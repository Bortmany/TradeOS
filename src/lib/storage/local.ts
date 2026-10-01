// TradeOS — local-disk screenshot store (development and tests). Files live in a
// folder OUTSIDE public/ (default ".storage/screenshots" next to the app), so the
// web server can never hand them out directly — only the owner-checked route can.

import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isValidStorageKey } from "./keys";
import type { StorageDriver } from "./types";

export function localStorageRoot(): string {
  return path.resolve(process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), ".storage", "screenshots"));
}

function fileFor(key: string): string {
  if (!isValidStorageKey(key)) throw new Error("Invalid storage key.");
  const root = localStorageRoot();
  const full = path.resolve(root, key);
  // Belt and braces: the key shape already forbids "..", but never trust one check.
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key.");
  return full;
}

export function createLocalDriver(): StorageDriver {
  return {
    name: "local",
    async put(key, bytes) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
    async get(key) {
      try {
        return await readFile(fileFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async delete(key) {
      await rm(fileFor(key), { force: true });
    },
  };
}
