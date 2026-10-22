import { ENV } from "./_core/env";

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
  return { Authorization: `Bearer ${secret}`, apikey: secret };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const config = storageConfig();
  const key = encodedObjectPath(relKey);
  const response = await fetch(apiUrl(config.baseUrl, "", key), {
    method: "POST",
    headers: { ...authHeaders(config.secret), "Content-Type": contentType, "x-upsert": "false" },
    body: typeof data === "string" ? data : new Uint8Array(data),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return { key, url: key };
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
