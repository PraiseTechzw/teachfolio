import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import { listLLMModels } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { COOKIE_NAME } from "../shared/const";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("current platform integration", () => {
  it("does not guess a production API when the project environment is absent", async () => {
    vi.stubEnv("MANUS_API_URL", ""); vi.stubEnv("MANUS_API_KEY", "test-only");
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(listLLMModels()).rejects.toThrow("MANUS_API_URL");
    expect(request).not.toHaveBeenCalled();
  });
  it("persists URL-only image results through Supabase Storage", async () => {
    vi.stubEnv("MANUS_API_URL", "https://api.example"); vi.stubEnv("MANUS_API_KEY", "test-only");
    vi.stubEnv("SUPABASE_URL", "https://project.example");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "teachfolio-evidence");
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ image: { url: "https://image.example/result.png", mimeType: "image/png" } })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
      .mockResolvedValueOnce(new Response(""));
    vi.stubGlobal("fetch", request);
    const image = await generateImage({ prompt: "test", originalImages: [] });
    expect(image.url).toMatch(/^generated\//);
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(request.mock.calls[0][1].body)).toHaveProperty("originalImages");
  });
  it("uses a dedicated HttpOnly same-site cookie for Supabase sessions", () => {
    expect(COOKIE_NAME).not.toBe("app_session_id");
    expect(getSessionCookieOptions({ protocol: "http", headers: {} } as never)).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax" });
  });
});
