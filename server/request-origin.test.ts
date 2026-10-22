import { describe, expect, it } from "vitest";
import { sameOriginUrl } from "./_core/request-origin";

const request = (headers: Record<string, string>) =>
  ({ get: (name: string) => headers[name.toLowerCase()] }) as never;

describe("trusted browser origin", () => {
  it("preserves HTTPS from a same-origin browser behind a TLS proxy", () => {
    expect(
      sameOriginUrl(
        request({
          host: "teachfolio.example",
          origin: "https://teachfolio.example",
        })
      )
    ).toBe("https://teachfolio.example");
  });

  it("rejects foreign hosts, unsupported schemes and missing origins", () => {
    expect(
      sameOriginUrl(
        request({ host: "teachfolio.example", origin: "https://evil.example" })
      )
    ).toBeNull();
    expect(
      sameOriginUrl(
        request({
          host: "teachfolio.example",
          origin: "javascript://teachfolio.example",
        })
      )
    ).toBeNull();
    expect(sameOriginUrl(request({ host: "teachfolio.example" }))).toBeNull();
  });
});
