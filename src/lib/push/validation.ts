import { z } from "zod";
import { isAllowedPushEndpoint } from "./hosts";

// The push address comes from the browser, so it must be https on a known push
// service (see hosts.ts). Anything else is refused.
export const endpointSchema = z
  .string()
  .min(10)
  .max(2048)
  .refine(isAllowedPushEndpoint, { message: "That device can't receive phone warnings." });

const keySchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key.");

export const subscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: keySchema, auth: keySchema }),
});

// Unsubscribe and test only need to name the device; no allow-list needed because
// they never call the address (test re-checks it before sending).
export const deviceSchema = z.object({ endpoint: z.string().min(10).max(2048) });
