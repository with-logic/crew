/**
 * Shared fixtures for the `crew search` suites: a stub known-tap
 * registry and a one-call multi-skill tap builder.
 */

import type { KnownTap } from "../../../src/known-taps/types.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

export const knownRegistry: readonly KnownTap[] = [
  {
    name: "supabase",
    url: "https://github.com/example/supabase-skills.git",
    subpath: "skills",
    description: "Supabase database workflows.",
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
  {
    name: "openai",
    url: "https://github.com/example/openai-skills.git",
    subpath: "",
    description: "OpenAI prompt workflows.",
    trust: "official",
    skills: [
      {
        name: "prompt-eval",
        namespace: null,
        description: "Evaluate prompt behavior.",
        path: "prompt-eval",
      },
    ],
  },
];

export function makeTestTap(
  prefix: string,
  skills: readonly { name: string; desc: string }[],
): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const s of skills) {
    makeSkill(repo, s.name, skillFrontmatter({ name: s.name, description: s.desc }));
  }
  commitAll(repo, "init");
  return repo;
}
