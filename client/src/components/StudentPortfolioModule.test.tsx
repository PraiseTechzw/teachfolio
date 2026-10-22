import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryResults = vi.hoisted(() => ({
  overview: {} as Record<string, unknown>,
  list: {} as Record<string, unknown>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    portfolio: {
      overview: { useQuery: () => queryResults.overview },
      list: { useQuery: () => queryResults.list },
    },
  },
}));

import StudentPortfolioModule from "./StudentPortfolioModule";

describe("StudentPortfolioModule outage behavior", () => {
  beforeEach(() => {
    queryResults.overview = {
      error: {
        message: "service unavailable",
        data: { httpStatus: 503 },
      },
      isLoading: false,
      data: undefined,
    };
    queryResults.list = { error: undefined, isLoading: false, data: [] };
  });

  it("shows an error without substituting fictional portfolio records", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentPortfolioModule, {
        path: "/portfolio",
        searchTerm: "",
        user: {
          id: 7,
          name: "Student",
          roles: ["student_teacher"],
          activated: true,
          institutionId: 3,
        },
        onCreate: () => undefined,
        onEdit: () => undefined,
        onNavigate: () => undefined,
      })
    );

    expect(markup).toContain("Authorized portfolio data could not be verified.");
    expect(markup).toContain(
      "No portfolio records are shown when access or validation cannot be confirmed."
    );
    expect(markup).not.toContain("Fractions and equivalent values");
    expect(markup).not.toContain("Fictional Practice School");
    expect(markup).not.toContain("DEMO MODE");
  });
});
