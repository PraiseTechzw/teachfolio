import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import type { AccessRole } from "../drizzle/schema";

export const applicationProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  let access;
  try { access = await db.getApplicationAccess(ctx.user.id); }
  catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Application access could not be verified." }); }
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "An active administrator-assigned application account is required." });
  return next({ ctx: { ...ctx, appAccess: access } });
});

export function requireRoles(...allowed: AccessRole[]) {
  return applicationProcedure.use(({ ctx, next }) => {
    if (!ctx.appAccess.roles.some(role => allowed.includes(role))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your assigned role does not permit this action." });
    }
    return next({ ctx });
  });
}

export function requireInstitutionAdmin() { return requireRoles("institution_admin", "platform_admin"); }
export function requirePlatformAdmin() { return requireRoles("platform_admin"); }
export function assertSameInstitution(accessInstitutionId: number | null, recordInstitutionId: number) {
  if (accessInstitutionId !== null && accessInstitutionId !== recordInstitutionId) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." });
}
