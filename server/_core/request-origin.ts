import type { Request } from "express";

/** Return the browser's same-origin URL, including the public TLS scheme behind a proxy. */
export function sameOriginUrl(req: Pick<Request, "get">): string | null {
  const host = req.get("host");
  const origin = req.get("origin");
  if (!host || !origin) return null;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== host)
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
