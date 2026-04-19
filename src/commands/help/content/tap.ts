import type { CommandHelp } from "./types.ts";

export const tapHelp: CommandHelp = {
  name: "tap",
  synopsis: "crew tap [add|remove|list] [args...]",
  summary: [
    "Taps are git repositories that act as skill registries. The default tap `core` is always present unless you explicitly remove it.",
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
    { command: "crew tap remove acme", description: "Remove a tap and delete its local clone." },
  ],
  sections: [
    {
      heading: "What a tap looks like",
      body: [
        "A tap is any git repository whose top-level directories are skills. That's it. No manifest, no registration, no index file — crew just clones the repo and walks one level deep.",
        "A minimal tap:",
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
        "`crew search` indexes every top-level directory that contains a valid `SKILL.md`. Nested directories and non-skill files are ignored by search but don't hurt anything — keep README, LICENSE, CI config, whatever.",
      ],
    },
    {
      heading: "Authoring your own tap",
      body: [
        "1. `git init my-skills && cd my-skills`",
        "2. For each skill: make a directory whose name matches the skill's frontmatter `name`, and put a `SKILL.md` inside it. See `crew help install` for the SKILL.md format (it's the Agent Skills spec — https://agentskills.io/specification).",
        "3. Commit and push to any git host (GitHub, GitLab, Bitbucket, a self-hosted remote, even a local `file://` path).",
        "4. Anyone can add it with `crew tap <git-url>`, or you as the author can install directly via `crew install @your-org/my-skills` to pick up every skill in one go.",
        "A tap is just a regular git repo — tags and branches are honored. `crew install my-skill@v1.0.0` pulls the version at that tag; `crew install my-skill` follows the default branch. Use tags to ship stable versions; users who want to float on `main` can.",
      ],
    },
  ],
  notes: [
    "Adding a tap is non-destructive — it just clones into `~/.crew/taps/<name>/` and indexes the skills inside. No confirmation is needed.",
    "Ambiguous bare names (a skill in two different taps) produce `ambiguous_reference` — qualify with `<tap>/<skill>` to pick one.",
  ],
  seeAlso: ["search", "install"],
};
