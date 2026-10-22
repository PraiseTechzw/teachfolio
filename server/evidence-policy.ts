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

export function validateEvidenceUpload(input: {
  fileName: string;
  mimeType: string;
  byteSize: number;
  signature: Uint8Array;
}): string | null {
  const fileName = input.fileName.trim();
  const mime = input.mimeType.toLowerCase();
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!fileName || !allowed[mime]?.includes(extension))
    return "Allowed types are PDF, DOCX, XLSX, PPTX, JPG, PNG, and MP4.";
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0)
    return "Choose a non-empty file.";
  if (input.byteSize > MAX_EVIDENCE_BYTES)
    return "Files are limited to 25 MiB.";
  if (!matchesSignature(mime, input.signature))
    return "The file contents do not match the selected file type.";
  return null;
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
