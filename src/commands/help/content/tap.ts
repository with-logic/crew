import type { CommandHelp } from "./types.ts";

export const tapHelp: CommandHelp = {
  name: "tap",
  synopsis: "crew tap [add|remove|list] [args...]",
  summary: [
    "Taps are git-managed directories filled with skills. The default tap `core` is always present unless you explicitly remove it.",
    "After adding a tap you can install any skill in it by bare name (e.g. `crew install python-testing`) without naming the tap.",
    "`crew tap <git-url> [<name>]` is a shorthand for `crew tap add <git-url> [<name>]` — when the first argument looks like a git source, the `add` keyword is optional.",
  ],
  flags: [
    { flag: "--force", description: "Allow removing the default `core` tap." },
    { flag: "--json", description: "Structured output for `tap list`." },
  ],
  examples: [
    {
      command: "crew tap list",
      description: "Show every configured tap and its last fetch time.",
    },
    {
      command: "crew tap @acme/skills",
      description: "Shorthand — add the GitHub repo as a tap named `skills`.",
    },
    {
      command: "crew tap add https://github.com/acme/skills.git acme",
      description: "Long form; same effect, with an explicit tap name.",
    },
    {
      command: "crew tap @with-logic/backend//skills",
      description:
        "Add a subpath tap — the skills live in the `skills/` directory of a larger repo. Default name: `backend-skills`.",
    },
    { command: "crew tap remove acme", description: "Remove a tap and delete its local clone." },
  ],
  sections: [
    {
      heading: "What a tap looks like",
      body: [
        "A tap is any git-managed directory whose immediate children are skills. No manifest, no registration, no index file — crew just clones the repo and walks one level deep inside the tap.",
        "The tap is the repo root by default:",
        {
          literal: true,
          lines: [
            "my-skills/",
            "├── README.md            # optional, informational",
            "├── python-testing/",
            "│   └── SKILL.md",
            "├── python-linting/",
            "│   └── SKILL.md",
            "└── docs/",
            "    └── contributing.md  # no SKILL.md → ignored",
          ],
        },
        "If your skills live in a subdirectory of a larger repo (e.g. a monorepo with a `skills/` folder), add `//<subpath>` to the git URL — crew treats that directory as the tap:",
        {
          literal: true,
          lines: [
            "crew tap add @with-logic/backend//skills",
            "",
            "backend/                 # the repo",
            "├── src/                 # your code",
            "├── docs/                # ignored by the tap",
            "└── skills/              # ← the tap is rooted here",
            "    ├── python-testing/",
            "    │   └── SKILL.md",
            "    └── python-linting/",
            "        └── SKILL.md",
          ],
        },
        "Once the tap is added you reference its skills the same way regardless of subpath — `crew install python-testing` or `crew install backend-skills/python-testing`. The subpath is invisible outside of `crew tap add`/`list`.",
        "`crew search` indexes every direct child of the tap directory that contains a valid `SKILL.md`. Nested directories and non-skill files are ignored by search but don't hurt anything — keep README, LICENSE, CI config, whatever.",
      ],
    },
    {
      heading: "Authoring your own tap",
      body: [
        "1. `git init my-skills && cd my-skills` (or point at a `skills/` subdirectory of an existing repo).",
        "2. For each skill: make a directory whose name matches the skill's frontmatter `name`, and put a `SKILL.md` inside it. See `crew help install` for the SKILL.md format (it's the Agent Skills spec — https://agentskills.io/specification).",
        "3. Commit and push to any git host (GitHub, GitLab, Bitbucket, a self-hosted remote, even a local `file://` path).",
        "4. Anyone can add it with `crew tap <git-url>` (plus `//<subpath>` if the skills aren't at the repo root), or you as the author can install directly via `crew install @your-org/my-skills` to pick up every skill in one go.",
        "A tap is just a regular git repo — tags and branches are honored by individual skill installs (`crew install my-skill@v1.0.0`); the tap itself tracks the default branch.",
      ],
    },
  ],
  notes: [
    "Adding a tap is non-destructive — it just clones into `~/.crew/taps/<name>/` and indexes the skills inside. No confirmation is needed.",
    "Re-adding the same tap (same name, same URL, same subpath) is a no-op. Re-adding with the same name but a different URL or subpath is rejected — pick a different name.",
    "Ambiguous bare names (a skill in two different taps) produce `ambiguous_reference` — qualify with `<tap>/<skill>` to pick one.",
  ],
  seeAlso: ["search", "install"],
};
