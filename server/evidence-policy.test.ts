import { describe, expect, it } from "vitest";
import {
  canAccessEvidenceFile,
  evidenceAppearsInAnySnapshot,
  evidenceIdsFromSnapshot,
  MAX_EVIDENCE_BYTES,
  validateEvidenceMetadata,
  validateEvidenceSignature,
  validateEvidenceUpload,
} from "./evidence-policy";

const validPdf = {
  fileName: "lesson.pdf",
  mimeType: "application/pdf",
  byteSize: 8,
  signature: Buffer.from("%PDF-1.7"),
};

describe("server-side evidence upload validation", () => {
  it("accepts a PDF whose extension, MIME type and signature match", () => {
    expect(validateEvidenceUpload(validPdf)).toBeNull();
  });

  it("rejects an extension/MIME mismatch and spoofed file signature", () => {
    expect(
      validateEvidenceUpload({ ...validPdf, fileName: "lesson.png" })
    ).toContain("Allowed types");
    expect(
      validateEvidenceUpload({
        ...validPdf,
        signature: Buffer.from("not a pdf"),
      })
    ).toContain("contents do not match");
  });

  it("rejects empty and oversized transfers", () => {
    expect(validateEvidenceUpload({ ...validPdf, byteSize: 0 })).toContain(
      "non-empty"
    );
    expect(
      validateEvidenceUpload({ ...validPdf, byteSize: MAX_EVIDENCE_BYTES + 1 })
    ).toContain("25 MiB");
  });

  it("validates upload metadata separately from the streamed file signature", () => {
    expect(
      validateEvidenceMetadata({
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        byteSize: 12,
      })
    ).toBeNull();
    expect(
      validateEvidenceSignature("video/mp4", Buffer.from("0000ftyp"))
    ).toContain("contents do not match");
    expect(
      validateEvidenceSignature("video/mp4", Buffer.from("0000ftypisom!"))
    ).toBeNull();
  });
});

describe("immutable evidence snapshot membership", () => {
  it("recognizes only positive numeric file IDs frozen in a snapshot", () => {
    const snapshot = {
      evidenceFileIds: [11, 11, 0, -2, "12", 13.5, Number.MAX_SAFE_INTEGER + 1],
    };
    expect(evidenceIdsFromSnapshot(snapshot)).toEqual([11]);
    expect(evidenceAppearsInAnySnapshot([snapshot], 11)).toBe(true);
    expect(evidenceAppearsInAnySnapshot([snapshot], 12)).toBe(false);
  });

  it("fails closed for malformed snapshots and invalid file IDs", () => {
    expect(evidenceIdsFromSnapshot(null)).toEqual([]);
    expect(evidenceIdsFromSnapshot({ evidenceFileIds: "11" })).toEqual([]);
    expect(evidenceAppearsInAnySnapshot([{ evidenceFileIds: [11] }], 0)).toBe(
      false
    );
  });
});

describe("private evidence access policy", () => {
  const base = {
    actorId: 10,
    institutionId: 8,
    fileInstitutionId: 8,
    ownerId: 20,
    uploaderUserId: 20,
    roles: ["supervisor"],
    assignedReviewer: true,
    appearsInSubmittedHistory: true,
  };

  it("denies platform administrators access to tenant evidence", () => {
    expect(
      canAccessEvidenceFile({
        ...base,
        institutionId: null,
        roles: ["platform_admin"],
      })
    ).toBe(false);
  });

  it("requires a same-institution assignment and a submitted snapshot for reviewers", () => {
    expect(canAccessEvidenceFile(base)).toBe(true);
    expect(canAccessEvidenceFile({ ...base, fileInstitutionId: 9 })).toBe(
      false
    );
    expect(
      canAccessEvidenceFile({ ...base, appearsInSubmittedHistory: false })
    ).toBe(false);
    expect(canAccessEvidenceFile({ ...base, assignedReviewer: false })).toBe(
      false
    );
  });

  it("permits the uploading student and tenant administrators only in their institution", () => {
    expect(
      canAccessEvidenceFile({
        ...base,
        actorId: 20,
        ownerId: 20,
        uploaderUserId: 20,
        roles: ["student_teacher"],
        assignedReviewer: false,
        appearsInSubmittedHistory: false,
      })
    ).toBe(true);
    expect(
      canAccessEvidenceFile({ ...base, roles: ["institution_admin"] })
    ).toBe(true);
    expect(
      canAccessEvidenceFile({
        ...base,
        institutionId: 9,
        roles: ["institution_admin"],
      })
    ).toBe(false);
  });
});
