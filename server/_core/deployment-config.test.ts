import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const renderBlueprint = readFileSync(`${repositoryRoot}render.yaml`, "utf8");
const dockerfile = readFileSync(`${repositoryRoot}Dockerfile`, "utf8");
const dockerignore = readFileSync(`${repositoryRoot}.dockerignore`, "utf8");

describe("staging deployment configuration", () => {
  it("uses the Docker application and database readiness check", () => {
    expect(renderBlueprint).toContain("runtime: docker");
    expect(renderBlueprint).toContain("healthCheckPath: /api/ready");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("/api/ready");
    expect(dockerignore).toContain(".env");
    expect(dockerignore).toContain(".aws");
    expect(dockerignore).toContain(".codex");
  });

  it("requires runtime secrets through the host and never migrates on deploy", () => {
    for (const key of [
      "DATABASE_URL",
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]) {
      expect(renderBlueprint).toContain(`- key: ${key}\n        sync: false`);
    }
    expect(renderBlueprint).toContain("autoDeployTrigger: 'off'");
    expect(renderBlueprint).not.toContain("preDeployCommand");
    expect(renderBlueprint).not.toContain("pnpm db:migrate");
    expect(renderBlueprint).not.toContain("pnpm seed:demo");
  });
});
