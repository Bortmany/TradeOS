// TradeOS — the one small interface every screenshot store implements.
// Two drivers sit behind it: local disk (development and tests) and an
// S3-compatible bucket (Cloudflare R2 in production). Callers never know which.

export interface StorageDriver {
  /** Which driver this is, for logs and tests. */
  readonly name: "local" | "s3";
  /** Save the bytes under a server-generated key. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Read the bytes back, or null when there is no such file. */
  get(key: string): Promise<Buffer | null>;
  /** Remove the file. Removing a file that is already gone is not an error. */
  delete(key: string): Promise<void>;
}
