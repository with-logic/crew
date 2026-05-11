import type { CommandHelp } from "./types.ts";

export const tapHelp: CommandHelp = {
  name: "tap",
  synopsis: "crew tap [add|remove|list|update] [args...]",
  summary: [
    "Manage the collections Homecrew searches and installs from. Each one is called a tap.",
    "A tap is just a folder of skills — usually a git repo, sometimes a local directory. Adding a tap lets you install its skills by name (`crew install python-testing`) instead of typing the full URL every time, and those skills show up in `crew search` too.",
    "You start with one tap (`core`) ready to go. Add your team's shared skills with `crew tap add <url>`, or `crew tap add <path>` to point at a folder you're working on locally.",
    "Shortcut: `crew tap <url>` is the same as `crew tap add <url>` — type whichever feels natural.",
  ],
  flags: [
    { flag: "--force", description: "Allow removing the default `core` tap." },
    {
      flag: "--recursive",
      description:
        "With `tap add`, enable bounded recursive fallback when standard layouts find no skills.",
    },
    { flag: "--json", description: "Machine-readable output for `tap list`." },
  ],
  examples: [
    {
      command: "crew tap list",
      description: "See every collection Homecrew is pulling from.",
    },
    {
      command: "crew tap @acme/skills",
      description: "Add a GitHub repo as a collection. Shorthand; the name is picked for you.",
    },
    {
      command: "crew tap add https://github.com/acme/skills.git acme",
      description: "Same thing, spelled out, with a specific name.",
    },
    {
      command: "crew tap add ./my-skills local-skills",
      description:
        "Add a local folder — great when you're developing your own skills alongside everything else.",
    },
    {
      command: "crew tap add --recursive @acme/monorepo acme",
      description: "Add a trusted repo whose skills are nested outside standard tap layouts.",
    },
    {
      command: "crew tap @with-logic/backend//skills",
      description: "The skills live in a subfolder of a bigger repo; Homecrew handles it.",
    },
    {
      command: "crew tap update",
      description:
        "Pull in the latest list from every collection (doesn't update installed skills).",
    },
    {
      command: "crew tap update acme",
      description: "Only refresh the named collection(s).",
    },
    { command: "crew tap remove acme", description: "Stop using a collection." },
  ],
  sections: [
    {
      heading: "What a tap looks like",
      body: [
        "A tap is just a git repo (or a local folder) where each subfolder with a `SKILL.md` is a skill. The `name` field inside `SKILL.md` is the install name. No manifest, no registry, no setup. If you can put it on GitHub, you can share it.",
        "Usually, skills live at the root of the repo:",
        {
          literal: true,
          lines: [
            "my-skills/",
            "├── README.md            # optional, just for humans",
            "├── python-testing/",
            "│   └── SKILL.md",
            "├── python-linting/",
            "│   └── SKILL.md",
            "└── docs/",
            "    └── contributing.md  # no SKILL.md → Homecrew skips it",
          ],
        },
        "If your skills live in a subfolder of a bigger repo, add `//<subfolder>` to the URL and Homecrew looks there instead:",
        {
          literal: true,
          lines: [
            "crew tap add @with-logic/backend//skills",
            "",
            "backend/                 # the repo",
            "├── src/                 # your code",
            "├── docs/                # Homecrew ignores this",
            "└── skills/              # ← the skills live here",
            "    ├── python-testing/",
            "    │   └── SKILL.md",
            "    └── python-linting/",
            "        └── SKILL.md",
          ],
        },
        "Once the tap is in place you use its skills the same way either way — `crew install python-testing`, or `crew install backend-skills/python-testing` if you want to be specific.",
        "README, LICENSE, CI configs, whatever else you keep in the repo is fine — Homecrew only looks for subfolders with a `SKILL.md`.",
      ],
    },
    {
      heading: "Authoring your own tap",
      body: [
        "Want to publish skills for your team? It's a regular git repo.",
        "1. `git init my-skills && cd my-skills` (or pick a `skills/` folder in a repo you already have).",
        "2. For each skill, make a folder and put a `SKILL.md` inside it. The folder name is just a filesystem location; the `name` field in `SKILL.md` is what users install. See `crew help install` for what goes in a SKILL.md (it's the Agent Skills spec — https://agentskills.io/specification).",
        "3. Commit and push anywhere you can push a git repo — GitHub, GitLab, Bitbucket, a self-hosted remote, a local `file://` URL for testing.",
        "4. Share it! Your team runs `crew tap <your-url>` and installs with `crew install <skill-name>`. Or `crew install <your-url>` to install everything at once.",
        "Tags and branches work like you'd expect — `crew install my-skill@v1.0.0` pins to a release; the tap itself follows the default branch.",
      ],
    },
  ],
  notes: [
    "Adding a tap is safe — Homecrew just clones (or points at) the folder and reads the skills inside. Nothing is installed until you ask for it.",
    "Re-adding the same thing is fine; Homecrew notices and doesn't do extra work. If you try to add a different URL under a name that's taken, Homecrew asks you to pick another name.",
    "Promoting an auto tap keeps its existing discovery mode; pass `--recursive` while promoting to upgrade it if needed.",
    "If a skill name exists in two different collections, you can be specific with `collection/skill` to pick which one.",
    "If a name is both a collection AND a skill in another collection, Homecrew asks you which you meant. Pass `--yes` in scripts, or use `other-collection/name` to be unambiguous.",
    "`crew tap update` is the lightweight cousin of `crew update`: it refreshes what's available to search and install, without touching skills you already have. Use `crew update` when you also want installed skills to catch up.",
  ],
  seeAlso: ["search", "install"],
};
