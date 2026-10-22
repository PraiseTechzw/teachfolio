import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import { evidenceFiles, portfolioEntries, submissionVersions } from "../drizzle/schema";
import * as db from "./db";
import { canAccessEvidenceFile, evidenceAppearsInAnySnapshot, MAX_EVIDENCE_BYTES, validateEvidenceMetadata, validateEvidenceSignature } from "./evidence-policy";
import { sdk } from "./_core/sdk";
import { storageDelete, storageGetSignedUrl, storagePut } from "./storage";

const MAX_BYTES = MAX_EVIDENCE_BYTES;

function fail(res: Response, status: number, message: string) { res.status(status).json({ error: message }); }

async function currentAccess(req: Request, res: Response) {
  const user = await sdk.authenticateRequest(req, res);
  const access = await db.getApplicationAccess(user.id);
  return { user, access };
}

export function registerEvidenceRoutes(app: Express) {
  app.post("/api/evidence/upload", async (req: Request, res: Response) => {
    try {
      const { user, access } = await currentAccess(req, res);
      if (!access || access.institutionId === null || !access.roles.includes("student_teacher")) return fail(res, 403, "An active student-teacher assignment is required.");
      if (req.headers["x-consent-confirmed"] !== "true") return fail(res, 400, "Confirm school and guardian authorization before uploading learner media.");
      const contentLength = Number(req.headers["content-length"]);
      if (!Number.isSafeInteger(contentLength) || contentLength <= 0) return fail(res, 411, "The upload length is required.");
      if (contentLength > MAX_BYTES) return fail(res, 413, "Files are limited to 25 MiB.");
      const entryId = Number(req.query.entryId);
      if (!Number.isSafeInteger(entryId) || entryId < 1) return fail(res, 400, "Evidence entry is required.");
      const database = await db.getDb();
      if (!database) return fail(res, 503, "Database is unavailable.");
      const matches = await database.select().from(portfolioEntries).where(and(eq(portfolioEntries.id, entryId), eq(portfolioEntries.institutionId, access.institutionId), eq(portfolioEntries.userId, user.id), eq(portfolioEntries.kind, "evidence"))).limit(1);
      const entry = matches[0];
      if (!entry || !["draft", "revision_required"].includes(entry.status)) return fail(res, 404, "Editable evidence entry not found.");
      const rawName = String(req.headers["x-file-name"] ?? "");
      let decodedName = rawName;
      try { decodedName = decodeURIComponent(rawName); } catch { return fail(res, 400, "File name is invalid."); }
      const fileName = decodedName.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 255);
      const mime = String(req.headers["x-file-type"] ?? "").toLowerCase();
      const invalidFile = validateEvidenceMetadata({ fileName, mimeType: mime, byteSize: contentLength });
      if (invalidFile) return fail(res, invalidFile.startsWith("Files are limited") ? 413 : 415, invalidFile);
      const iterator = req[Symbol.asyncIterator]();
      const prefixChunks: Buffer[] = [];
      let prefixLength = 0;
      while (prefixLength < 16) {
        const next = await iterator.next();
        if (next.done) break;
        const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
        prefixChunks.push(chunk);
        prefixLength += chunk.length;
      }
      const signature = Buffer.concat(prefixChunks, Math.min(prefixLength, 16));
      const invalidSignature = validateEvidenceSignature(mime, signature);
      if (invalidSignature) return fail(res, 415, invalidSignature);
      const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
      const key = `evidence/${access.institutionId}/${user.id}/${entryId}/${randomUUID()}${ext}`;
      const requestBody = Readable.from((async function* () {
        let transferred = 0;
        for (const chunk of prefixChunks) {
          transferred += chunk.length;
          if (transferred > contentLength || transferred > MAX_BYTES) throw new Error("Upload size exceeded its declared limit.");
          yield chunk;
        }
        while (true) {
          const next = await iterator.next();
          if (next.done) break;
          const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
          transferred += chunk.length;
          if (transferred > contentLength || transferred > MAX_BYTES) throw new Error("Upload size exceeded its declared limit.");
          yield chunk;
        }
        if (transferred !== contentLength) throw new Error("Upload size did not match its declared length.");
      })());
      let stored: { key: string };
      try { stored = await storagePut(key, requestBody, mime, contentLength); }
      catch { return fail(res, 503, "Private storage did not accept the file. No evidence upload was recorded."); }
      try {
        const inserted = await database.insert(evidenceFiles).values({ institutionId: access.institutionId, entryId, uploaderUserId: user.id, objectKey: stored.key, fileName, mimeType: mime, byteSize: contentLength, consentConfirmed: true }).returning({ id: evidenceFiles.id });
        return res.status(201).json({ id: inserted[0]!.id, fileName, mimeType: mime, byteSize: contentLength, uploaded: true });
      } catch (error) {
        await storageDelete(stored.key).catch(() => console.error("[Evidence] failed to remove an unreferenced storage object"));
        throw error;
      }
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 413) return fail(res, 413, "Files are limited to 25 MiB.");
      if ((error as { name?: string })?.name === "ForbiddenError") return fail(res, 401, "Sign in to continue.");
      console.error("[Evidence] upload failed:", error instanceof Error ? error.message : "unknown error");
      return fail(res, 500, "The upload could not be completed.");
    }
  });

  app.get("/api/evidence/:id/download", async (req: Request, res: Response) => {
    try {
      const { user, access } = await currentAccess(req, res);
      if (!access || access.institutionId === null) return fail(res, 403, "An active institution assignment is required for private evidence access.");
      const fileId = Number(req.params.id);
      if (!Number.isSafeInteger(fileId) || fileId < 1) return fail(res, 404, "File not found.");
      const database = await db.getDb();
      if (!database) return fail(res, 503, "Database is unavailable.");
      const where = and(eq(evidenceFiles.id, fileId), eq(evidenceFiles.institutionId, access.institutionId));
      const rows = await database.select().from(evidenceFiles).where(where).limit(1);
      const file = rows[0];
      if (!file) return fail(res, 404, "File not found.");
      const entryRows = await database.select().from(portfolioEntries).where(and(eq(portfolioEntries.id, file.entryId), eq(portfolioEntries.institutionId, file.institutionId))).limit(1);
      const entry = entryRows[0];
      if (!entry) return fail(res, 404, "File not found.");
      const reviewerRole = access.roles.some(role => role === "supervisor" || role === "lecturer");
      const assigned = reviewerRole && await db.verifyReviewerAssignment(file.institutionId, entry.userId, user.id);
      const versions = reviewerRole && assigned
        ? await database.select({ snapshot: submissionVersions.snapshot }).from(submissionVersions).where(and(eq(submissionVersions.institutionId, file.institutionId), eq(submissionVersions.entryId, file.entryId)))
        : [];
      const appearsInSubmittedHistory = evidenceAppearsInAnySnapshot(versions.map(version => version.snapshot), file.id);
      if (!canAccessEvidenceFile({ actorId: user.id, institutionId: access.institutionId, fileInstitutionId: file.institutionId, ownerId: entry.userId, uploaderUserId: file.uploaderUserId, roles: access.roles, assignedReviewer: assigned, appearsInSubmittedHistory })) return fail(res, 404, "File not found.");
      if (reviewerRole && assigned && user.id !== entry.userId && !appearsInSubmittedHistory) {
        return fail(res, 404, "File not found.");
      }
      if (file.byteSize > MAX_BYTES) return fail(res, 413, "Stored file exceeds the permitted transfer size.");
      let storedObject: globalThis.Response;
      try {
        const signedUrl = await storageGetSignedUrl(file.objectKey);
        storedObject = await fetch(
          signedUrl,
          req.headers.range ? { headers: { Range: req.headers.range } } : undefined
        );
      } catch {
        return fail(res, 503, "Private file storage is temporarily unavailable.");
      }
      if (storedObject.status === 416) {
        const contentRange = storedObject.headers.get("content-range");
        if (contentRange) res.setHeader("Content-Range", contentRange);
        return fail(res, 416, "The requested media range is not available.");
      }
      if (!storedObject.ok || !storedObject.body) return fail(res, storedObject.status === 404 ? 404 : 503, "The private file is not available from storage.");
      const contentLength = storedObject.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_BYTES) {
        await storedObject.body.cancel();
        return fail(res, 413, "Stored file exceeds the permitted transfer size.");
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/'/g, "%27")}`);
      const contentRange = storedObject.headers.get("content-range");
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (contentLength && /^\d+$/.test(contentLength)) res.setHeader("Content-Length", contentLength);
      if (storedObject.status === 206) res.status(206);
      await pipeline(Readable.fromWeb(storedObject.body as unknown as import("node:stream/web").ReadableStream), res);
      return;
    } catch (error) {
      console.error("[Evidence] private download relay failed:", error instanceof Error ? error.name : "unknown error");
      if (res.headersSent) { res.destroy(error instanceof Error ? error : undefined); return; }
      return fail(res, 403, "File access could not be authorized.");
    }
  });
}
