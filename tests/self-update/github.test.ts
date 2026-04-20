/**
 * Tests for the GitHub release-feed client.
 *
 * The default `fetchRelease` shells out to `curl`, which we can't
 * reliably run in CI against the real GitHub API. The seam
 * (`setReleaseFetcher`) lets every test inject a pure stub. A
 * separate test verifies the URL construction and env-var override.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import {
  fetchRelease,
  releasesByTagUrl,
  releasesLatestUrl,
  resetReleaseFetcher,
  setReleaseFetcher,
} from "../../src/self-update/github.ts";

afterEach(() => {
  resetReleaseFetcher();
  delete process.env["CREW_SELF_UPDATE_RELEASES_URL"];
});

describe("URL helpers", () => {
  test("releasesLatestUrl defaults to the canonical GitHub API", () => {
    expect(releasesLatestUrl()).toBe(
      "https://api.github.com/repos/with-logic/crew/releases/latest",
    );
  });

  test("releasesLatestUrl honors the override env var", () => {
    process.env["CREW_SELF_UPDATE_RELEASES_URL"] = "https://example.com/api/releases/latest";
    expect(releasesLatestUrl()).toBe("https://example.com/api/releases/latest");
  });

  test("releasesByTagUrl rewrites /releases/latest to /releases/tags/<tag>", () => {
    expect(releasesByTagUrl("v0.4.0")).toBe(
      "https://api.github.com/repos/with-logic/crew/releases/tags/v0.4.0",
    );
  });

  test("releasesByTagUrl works with a trailing slash on the override", () => {
    process.env["CREW_SELF_UPDATE_RELEASES_URL"] = "https://example.com/api/releases/latest/";
    expect(releasesByTagUrl("v1.0")).toBe("https://example.com/api/releases/tags/v1.0");
  });
});

describe("fetchRelease (stubbed seam)", () => {
  test("returns tag and assets from the injected fetcher", () => {
    setReleaseFetcher(() => ({
      tag: "v0.9.9",
      assets: { "crew-macos-arm64": "https://example.com/arm64" },
    }));
    const r = fetchRelease("any-url", 5);
    expect(r.tag).toBe("v0.9.9");
    expect(r.assets["crew-macos-arm64"]).toBe("https://example.com/arm64");
  });

  test("passes the timeout through unchanged", () => {
    let seenTimeout = 0;
    setReleaseFetcher((_url, timeout) => {
      seenTimeout = timeout;
      return { tag: "v1", assets: {} };
    });
    fetchRelease("any-url", 42);
    expect(seenTimeout).toBe(42);
  });

  test("propagates CrewError thrown by the fetcher", () => {
    setReleaseFetcher(() => {
      throw new CrewError("self_update_unavailable", "injected failure");
    });
    expect(() => fetchRelease("any-url", 5)).toThrow("injected failure");
  });
});
