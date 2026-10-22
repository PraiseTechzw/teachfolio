import type { Request, Response } from "express";

type ReadinessProbe = () => Promise<void>;

export function createReadinessHandler(probe: ReadinessProbe) {
  return async (_request: Request, response: Response) => {
    try {
      await probe();
      response.status(200).json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "not_ready" });
    }
  };
}
