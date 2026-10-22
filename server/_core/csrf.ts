import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "./env";

const TOKEN_LIFETIME_SECONDS = 60 * 60;
function key() {
  if (!ENV.cookieSecret) throw new Error("Session signing secret is unavailable.");
  return ENV.cookieSecret;
}
export function issueCsrfToken(openId: string, now = Math.floor(Date.now() / 1000)) {
  const payload = Buffer.from(JSON.stringify({ sub: openId, exp: now + TOKEN_LIFETIME_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyCsrfToken(token: string | undefined, openId: string, now = Math.floor(Date.now() / 1000)) {
  if (!token || token.length > 2048) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  try {
    const expected = createHmac("sha256", key()).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    return claims.sub === openId && typeof claims.exp === "number" && claims.exp > now;
  } catch { return false; }
}
