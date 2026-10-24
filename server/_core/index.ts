import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerEvidenceRoutes } from "../evidence";
import { issueCsrfToken, verifyCsrfToken } from "./csrf";
import { sdk } from "./sdk";
import { sameOriginUrl } from "./request-origin";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { createReadinessHandler } from "./readiness";

async function startServer() {
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY ||
    !process.env.SUPABASE_SECRET_KEY
  )
    throw new Error(
      "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required."
    );
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL (Supabase PostgreSQL connection string) is required."
    );
  if (
    !process.env.SESSION_SECRET ||
    Buffer.byteLength(process.env.SESSION_SECRET) < 32
  )
    throw new Error(
      "SESSION_SECRET must be set to at least 32 random bytes for CSRF protection."
    );
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "100kb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get(
    "/api/ready",
    createReadinessHandler(async () => {
      const database = await getDb();
      if (!database) throw new Error("Database is not configured.");
      await database.execute(sql`select 1`);
    })
  );
  app.get("/api/csrf", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req, res);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ token: issueCsrfToken(user.openId) });
    } catch {
      res.status(401).json({ error: "Authenticated session required." });
    }
  });
  const requireCsrf = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    // Anonymous credential submissions have no session-bound token yet. Require
    // a same-origin browser request to prevent login CSRF.
    if (
      [
        "/auth.login",
        "/auth.register",
        "/auth.confirmSession",
        "/auth.requestPasswordReset",
        "/auth.resendSignupConfirmation",
        "/auth.updatePassword",
      ].includes(req.path)
    ) {
      if (!sameOriginUrl(req)) {
        res.status(403).json({ error: "Same-origin login request required." });
        return;
      }
      next();
      return;
    }
    try {
      const user = await sdk.authenticateRequest(req, res);
      const token = req.headers["x-csrf-token"];
      if (typeof token !== "string" || !verifyCsrfToken(token, user.openId)) {
        res
          .status(403)
          .json({ error: "A valid session-bound CSRF token is required." });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: "Authenticated session required." });
    }
  };
  app.use("/api/trpc", (req, res, next) =>
    req.method === "GET" || req.method === "HEAD"
      ? next()
      : requireCsrf(req, res, next)
  );
  app.use("/api/evidence/upload", requireCsrf);
  registerEvidenceRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  // Render's runtime mode is controlled by the deployment environment. Treat
  // hosted instances as production even if a dashboard setting accidentally
  // leaves NODE_ENV=development; Vite's dev server is for local use only.
  const isDevelopment =
    process.env.NODE_ENV === "development" && process.env.RENDER !== "true";
  if (isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
