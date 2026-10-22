import { describe, expect, it } from "vitest";
import {
  evidenceAppearsInAnySnapshot,
  evidenceIdsFromSnapshot,
  MAX_EVIDENCE_BYTES,
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
