import { z } from "zod";

// A record id taken from the address (/api/.../[id]). Ours are short cuid
// strings; anything empty or huge is refused (400) before it reaches a query.
export const routeIdSchema = z.string().min(1).max(64);
