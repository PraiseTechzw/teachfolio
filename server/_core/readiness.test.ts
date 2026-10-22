import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createReadinessHandler } from "./readiness";

function responseRecorder() {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;

  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

describe("database readiness handler", () => {
  it("returns ready when the database probe succeeds", async () => {
    const probe = vi.fn(async () => undefined);
    const result = responseRecorder();

    await createReadinessHandler(probe)({} as Request, result.response);

    expect(probe).toHaveBeenCalledOnce();
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ status: "ready" });
  });

  it("returns a generic unavailable response when the database probe fails", async () => {
    const probe = vi.fn(async () => {
      throw new Error("database credentials must never be returned");
    });
    const result = responseRecorder();

    await createReadinessHandler(probe)({} as Request, result.response);

    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({ status: "not_ready" });
    expect(JSON.stringify(result.body)).not.toContain("credentials");
  });
});
