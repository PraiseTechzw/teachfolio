import { createClient, type Session, type User as SupabaseUser } from "@supabase/supabase-js";
import type { Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";

export const REFRESH_COOKIE = "teachfolio_refresh_token";

function authClient() {
  if (!ENV.supabaseUrl || !ENV.supabasePublishableKey) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
  }
  return createClient(ENV.supabaseUrl, ENV.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function setAuthCookies(res: Response, req: Request, session: Session) {
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, session.access_token, {
    ...cookieOptions,
    maxAge: Math.max(1, session.expires_in) * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function setAuthCookiesForRefresh(res: Response, req: Request, session: Session) {
  setAuthCookies(res, req, session);
}

export function clearAuthCookies(res: Response, req: Request) {
  const options = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 });
  res.clearCookie(REFRESH_COOKIE, { ...options, maxAge: -1 });
}

export async function registerAccount(input: { email: string; name: string; password: string }, req: Request, res: Response) {
  const { data, error } = await authClient().auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: { data: { full_name: input.name.trim() } },
  });
  if (error) throw error;
  if (data.session) setAuthCookies(res, req, data.session);
  return { requiresEmailConfirmation: !data.session, user: data.user };
}

export async function signInAccount(email: string, password: string, req: Request, res: Response) {
  const { data, error } = await authClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(), password,
  });
  if (error || !data.session || !data.user) throw new Error("Email or password is incorrect, or email confirmation is still required.");
  setAuthCookies(res, req, data.session);
  return data.user;
}

export async function refreshSupabaseSession(accessToken: string, refreshToken?: string) {
  const client = authClient();
  const { data: current } = await client.auth.getUser(accessToken);
  if (current.user) return { user: current.user, session: null as Session | null };
  if (!refreshToken) return null;
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return null;
  return { user: data.user, session: data.session };
}

export async function revokeSession(accessToken: string, refreshToken?: string) {
  const client = authClient();
  if (refreshToken) {
    await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    await client.auth.signOut({ scope: "local" });
  }
}

export function supabaseIdentity(user: SupabaseUser) {
  return {
    openId: user.id,
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    email: user.email ?? null,
  };
}
