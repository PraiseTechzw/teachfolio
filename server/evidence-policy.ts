export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

const allowed: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "video/mp4": [".mp4"],
};

function matchesSignature(mime: string, signature: Uint8Array) {
  if (mime === "application/pdf")
    return Buffer.from(signature).subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/jpeg")
    return (
      signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
    );
  if (mime === "image/png")
    return Buffer.from(signature)
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "video/mp4")
    return (
      signature.length > 12 &&
      Buffer.from(signature).subarray(4, 8).toString() === "ftyp"
    );
  if (mime.startsWith("application/vnd.openxmlformats-officedocument."))
    return signature[0] === 0x50 && signature[1] === 0x4b;
  return false;
}

export function validateEvidenceMetadata(input: {
  fileName: string;
  mimeType: string;
  byteSize: number;
}, maxBytes = MAX_EVIDENCE_BYTES): string | null {
  const fileName = input.fileName.trim();
  const mime = input.mimeType.toLowerCase();
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!fileName || !allowed[mime]?.includes(extension))
    return "Allowed types are PDF, DOCX, XLSX, PPTX, JPG, PNG, and MP4.";
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0)
    return "Choose a non-empty file.";
  if (input.byteSize > maxBytes)
    return `Files are limited to ${Math.floor(maxBytes / (1024 * 1024))} MiB.`;
  return null;
}

export function validateEvidenceSignature(
  mimeType: string,
  signature: Uint8Array
): string | null {
  if (!matchesSignature(mimeType.toLowerCase(), signature))
    return "The file contents do not match the selected file type.";
  return null;
}

export function validateEvidenceUpload(input: {
  fileName: string;
  mimeType: string;
  byteSize: number;
  signature: Uint8Array;
}): string | null {
  return (
    validateEvidenceMetadata(input) ??
    validateEvidenceSignature(input.mimeType, input.signature)
  );
}

export function evidenceIdsFromSnapshot(snapshot: unknown): number[] {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    Array.isArray(snapshot)
  )
    return [];
  const ids = (snapshot as Record<string, unknown>).evidenceFileIds;
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids.filter(
        (id): id is number =>
          typeof id === "number" && Number.isSafeInteger(id) && id > 0
      )
    ),
  ];
}

export function evidenceAppearsInAnySnapshot(
  snapshots: readonly unknown[],
  fileId: number
): boolean {
  if (!Number.isSafeInteger(fileId) || fileId < 1) return false;
  return snapshots.some(snapshot =>
    evidenceIdsFromSnapshot(snapshot).includes(fileId)
  );
}

export function canAccessEvidenceFile(input: {
  actorId: number;
  institutionId: number | null;
  fileInstitutionId: number;
  ownerId: number;
  uploaderUserId: number;
  roles: readonly string[];
  assignedReviewer: boolean;
  appearsInSubmittedHistory: boolean;
}) {
  // Platform administrators manage tenants, not student evidence. Evidence
  // access always requires an explicit institution assignment.
  if (
    input.institutionId === null ||
    input.institutionId !== input.fileInstitutionId
  )
    return false;
  const privileged = input.roles.some(role =>
    ["institution_admin", "coordinator"].includes(role)
  );
  if (privileged) return true;
  const owner =
    input.roles.includes("student_teacher") &&
    input.actorId === input.ownerId &&
    input.actorId === input.uploaderUserId;
  if (owner) return true;
  return (
    input.assignedReviewer &&
    input.appearsInSubmittedHistory &&
    input.roles.some(role => ["supervisor", "lecturer"].includes(role))
  );
}
