/**
 * Fixtures for the known-tap fallback suites (§16.6, C-TAP-24): the
 * known-tap registry the tests install, an offline stand-in for its
 * source URL, and the home/config builders every file shares.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { setKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import type { KnownTap } from "../../../src/known-taps/types.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";

/**
 * A `file://` URL for a repo that does not exist. These tests only assert
 * on suggestion text, but `crew install` materializes configured taps on
 * demand, so a remote URL here would make the suite clone over the
 * network. A nonexistent local path fails instantly and offline.
 *
 * No `.git` suffix: `knownTapSource` only folds that suffix away for
 * GitHub HTTPS URLs, and the by-source dedupe in `knownTapIsConfigured`
 * compares the rendered source strings. Using one spelling throughout
 * keeps the fixture exercising dedupe rather than suffix handling.
 */
export const UNREACHABLE_TAP_URL = `file://${join(tmpdir(), "crew-absent-supabase-skills")}`;

export const KNOWN_TAPS: readonly KnownTap[] = [
  {
    name: "supabase",
    url: UNREACHABLE_TAP_URL,
    subpath: "skills",
    description: "Supabase workflows.",
    trust: "curated",
    skills: [
      {
        name: "schema-review",
        namespace: "database",
        description: "Review SQL migrations and RLS policies.",
        path: "database/schema-review",
      },
      {
        name: "auth-audit",
        namespace: null,
        description: "Audit auth flows.",
        path: "auth-audit",
      },
    ],
  },
];

export function homeWithKnownTaps(): string {
  const home = makeCrewHome();
  setKnownTapsForTest(KNOWN_TAPS);
  const setupStreams = captureStreams();
  runCli(["tap", "remove", "core", "--force"], { home, streams: setupStreams.streams });
  return home;
}

export function configuredKnownSource() {
  return {
    kind: "git" as const,
    registered: true,
    url: UNREACHABLE_TAP_URL,
    subpath: "skills",
    path: "",
  };
}
