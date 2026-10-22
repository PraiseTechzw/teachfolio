import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryResults = vi.hoisted(() => ({
  institutions: {} as Record<string, unknown>,
  audit: {} as Record<string, unknown>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    admin: {
      institutions: { useQuery: () => queryResults.institutions },
      audit: { useQuery: () => queryResults.audit },
    },
  },
}));

import PlatformAdminOverview from "./PlatformAdminOverview";

describe("PlatformAdminOverview", () => {
  beforeEach(() => {
    queryResults.institutions = {
      data: [
        {
          id: 1,
          name: "Mavambo Teacher College (Fictional Demo)",
          code: "TEACHFOLIO-DEMO",
          active: true,
          isDemo: true,
          createdAt: new Date("2026-01-10T00:00:00Z"),
        },
        {
          id: 2,
          name: "Highlands College",
          code: "HLC-01",
          active: false,
          isDemo: false,
          createdAt: new Date("2026-02-10T00:00:00Z"),
        },
      ],
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    };
    queryResults.audit = {
      data: [
        {
          id: 12,
          action: "institution_created",
          targetType: "institution",
          targetId: "2",
          institutionId: null,
          createdAt: new Date("2026-02-10T08:30:00Z"),
        },
      ],
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    };
  });

  it("summarizes persisted institutions and platform audit activity", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformAdminOverview, {
        name: "Praise Masunga",
        onNavigate: () => undefined,
      })
    );

    expect(markup).toContain("Good to see you, Praise");
    expect(markup).toContain("Institution workspaces");
    expect(markup).toContain("Highlands College");
    expect(markup).toContain("Paused");
    expect(markup).toContain("Reserved practice workspaces are excluded from institution totals.");
    expect(markup).not.toContain("Mavambo Teacher College");
    expect(markup).not.toContain("DEMO");
    expect(markup).toContain("institution created");
    expect(markup).not.toContain("Sample student");
  });

  it("shows honest empty states when real queries contain no records", () => {
    queryResults.institutions = {
      data: [],
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    };
    queryResults.audit = {
      data: [],
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    };

    const markup = renderToStaticMarkup(
      createElement(PlatformAdminOverview, {
        name: null,
        onNavigate: () => undefined,
      })
    );

    expect(markup).toContain("No institution workspaces yet");
    expect(markup).toContain("No platform activity recorded yet");
    expect(markup).toContain("Good to see you, there");
  });
});
