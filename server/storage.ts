import { ENV } from "./_core/env";
import { Readable } from "node:stream";

function storageConfig() {
  const baseUrl = ENV.supabaseUrl.replace(/\/+$/, "");
  const secret = ENV.supabaseSecretKey;
  const bucket = ENV.supabaseStorageBucket;
  if (!baseUrl || !secret || !bucket) {
    throw new Error("Set SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_STORAGE_BUCKET.");
  }
  return { baseUrl, secret, bucket };
}

function encodedObjectPath(key: string) {
  return key.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function apiUrl(baseUrl: string, operation: string, key: string) {
  const { bucket } = storageConfig();
  const operationPath = operation ? `${operation}/` : "";
  return `${baseUrl}/storage/v1/object/${operationPath}${encodeURIComponent(bucket)}/${encodedObjectPath(key)}`;
}

function authHeaders(secret: string) {
  // Supabase publishable/secret API keys belong in `apikey`; they are not JWTs.
  return { apikey: secret };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string | Readable,
  contentType = "application/octet-stream",
  contentLength?: number,
): Promise<{ key: string; url: string }> {
  const config = storageConfig();
  const key = encodedObjectPath(relKey);
  const streaming = data instanceof Readable;
  const headers: Record<string, string> = { ...authHeaders(config.secret), "Content-Type": contentType, "x-upsert": "false" };
  if (streaming && contentLength !== undefined) headers["Content-Length"] = String(contentLength);
  const response = await fetch(apiUrl(config.baseUrl, "", key), {
    method: "POST",
    headers,
    body: typeof data === "string" ? data : streaming ? data as unknown as BodyInit : new Uint8Array(data),
    ...(streaming ? { duplex: "half" } : {}),
  } as RequestInit & { duplex?: "half" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return { key, url: key };
}

export async function storageDelete(relKey: string): Promise<void> {
  const config = storageConfig();
  const key = encodedObjectPath(relKey);
  const response = await fetch(apiUrl(config.baseUrl, "", key), {
    method: "DELETE",
    headers: authHeaders(config.secret),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase Storage delete failed (${response.status}).`);
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = encodedObjectPath(relKey);
  return { key, url: key };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const config = storageConfig();
  const key = encodedObjectPath(relKey);
  const response = await fetch(apiUrl(config.baseUrl, "sign", key), {
    method: "POST",
    headers: { ...authHeaders(config.secret), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage signing failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const result = await response.json() as { signedURL?: string };
  if (!result.signedURL) throw new Error("Supabase Storage returned no signed URL.");
  return new URL(result.signedURL, config.baseUrl).toString();
}
