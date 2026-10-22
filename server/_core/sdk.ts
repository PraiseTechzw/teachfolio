import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { REFRESH_COOKIE, refreshSupabaseSession, setAuthCookiesForRefresh, supabaseIdentity } from "../supabase-auth";

class SDKServer {
  private readonly requestUsers = new WeakMap<Request, Promise<AuthenticatedUser>>();

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  async authenticateRequest(req: Request, res?: Response): Promise<AuthenticatedUser> {
    const existing = this.requestUsers.get(req);
    if (existing) return existing;
    const pending = this.resolveAuthenticatedRequest(req, res);
    this.requestUsers.set(req, pending);
    return pending;
  }

  private async resolveAuthenticatedRequest(req: Request, res?: Response): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    if (!sessionToken) throw ForbiddenError("Supabase Auth session required");
    let auth;
    try {
      auth = await refreshSupabaseSession(sessionToken, cookies.get(REFRESH_COOKIE));
    } catch {
      throw ForbiddenError("Could not verify Supabase Auth session");
    }
    if (!auth) throw ForbiddenError("Supabase Auth session expired");
    if (auth.session && res) {
      setAuthCookiesForRefresh(res, req, auth.session);
    }
    const identity = supabaseIdentity(auth.user);
    const signedInAt = new Date();
    await db.upsertUser({ ...identity, loginMethod: "supabase", lastSignedIn: signedInAt });
    const user = await db.getUserByOpenId(identity.openId);
    if (!user) {
      throw ForbiddenError("User not found");
    }
    return user;
  }
}

/** Result of `sdk.authenticateRequest`. */
export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};


export const sdk = new SDKServer();
