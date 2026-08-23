import { describe, expect, it, vi } from "vitest";
import type { CloudLinkPendingPairing } from "@fusion/core";
import { resolveCloudPairCompleteRequest } from "../cloud.js";

const pending: CloudLinkPendingPairing = {
  httpBaseUrl: "https://amiable-gerbil-978.convex.site",
  code: "ABCD-EFGH",
  pendingSecret: "pending-secret",
  createdAt: "2026-08-23T00:00:00Z",
};

describe("resolveCloudPairCompleteRequest", () => {
  it("uses the pending origin when --http is omitted", () => {
    const result = resolveCloudPairCompleteRequest({}, () => pending);
    expect(result.http).toBe("https://amiable-gerbil-978.convex.site");
    expect(result.code).toBe("ABCD-EFGH");
    expect(result.pendingSecret).toBe("pending-secret");
  });

  it("allows matching --http with pending fallback credentials", () => {
    const result = resolveCloudPairCompleteRequest(
      { http: "https://amiable-gerbil-978.convex.site/" },
      () => pending,
    );
    expect(result.http).toBe("https://amiable-gerbil-978.convex.site");
  });

  it("rejects mismatched --http when either credential falls back to pending", () => {
    expect(() =>
      resolveCloudPairCompleteRequest({ http: "https://other.convex.site" }, () => pending),
    ).toThrow(/different Cloud URL/);
    expect(() =>
      resolveCloudPairCompleteRequest(
        { http: "https://other.convex.site", code: "ZZZZ-YYYY" },
        () => pending,
      ),
    ).toThrow(/different Cloud URL/);
    expect(() =>
      resolveCloudPairCompleteRequest(
        { http: "https://other.convex.site", pendingSecret: "other-secret" },
        () => pending,
      ),
    ).toThrow(/different Cloud URL/);
  });

  it("allows a different --http when both credentials are explicit", () => {
    const result = resolveCloudPairCompleteRequest(
      {
        http: "https://other.convex.site",
        code: "ZZZZ-YYYY",
        pendingSecret: "other-secret",
      },
      () => pending,
    );
    expect(result.http).toBe("https://other.convex.site");
    expect(result.code).toBe("ZZZZ-YYYY");
    expect(result.pendingSecret).toBe("other-secret");
  });
});

describe("runCloudHeartbeat", () => {
  it("is imported as a single-shot handler for --url (no loop option)", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../cloud.ts", import.meta.url), "utf8"),
    );
    expect(src).not.toMatch(/for\s*\(\s*;\s*;\s*\)/);
    expect(src).not.toMatch(/opts\.loop/);
  });
});
