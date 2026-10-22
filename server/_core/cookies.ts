import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(_req: Request): CookieOptions {
  return { httpOnly: true, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" };
}
