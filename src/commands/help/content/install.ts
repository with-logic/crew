import type { CommandHelp } from "./types.ts";

export const installHelp: CommandHelp = {
  name: "install",
  synopsis: "crew install <ref> [<ref>...]",
  summary: [
    "Install one or more skills into every detected agent coder.",
    "A <ref> is a skill name, a local path, a git URL, or a host shorthand. See REFERENCE FORMS below for every shape crew accepts.",
    "Install from a directory (path or git URL) with no root SKILL.md and crew walks one level deep, installing every skill it finds and attributing them to a single tap — `crew update` picks up new skills added upstream.",
    "A bare name that matches a configured tap installs every skill the tap exposes — same outcome as `crew install <tap-url>`.",
  ],
  flags: [
    {
      flag: "--scope {user,project}",
      description: "Install globally (default) or under the current directory.",
    },
    {
      flag: "--target <name>",
      description: "Restrict to named target(s). Repeatable. See `crew targets`.",
    },
    { flag: "--dry-run", description: "Show what would be installed without writing files." },
    {
      flag: "--force",
      description:
        "Overwrite a customized or untracked destination. NEVER overrides a name conflict, invalid skill, or dependency conflict.",
    },
    { flag: "--json", description: "Emit a structured install summary." },
  ],
  examples: [
    {
      command: "crew install python-testing",
      description: "Install a skill from your configured taps.",
    },
    {
      command: "crew install @with-logic/skills",
      description:
        "Install every skill in a GitHub repo. crew creates an auto tap for the URL; new skills are picked up on next update.",
    },
    {
      command: "crew install team-skills",
      description:
        "Install every skill in a configured tap named `team-skills` (same as `crew install <team-skills-url>`).",
    },
    {
      command: "crew install gh:acme/skills@v1.2.0//python/testing",
      description: "Install one skill from a tagged GitHub repo at a subpath.",
    },
    {
      command: "crew install ./my-skill",
      description: "Install a skill from a local directory.",
    },
    {
      command: "crew install --scope project team/conventions",
      description: "Install only into the current project directory.",
    },
    {
      command: "crew install --dry-run --target claude-code python-testing",
      description: "Preview what would happen in Claude Code, write nothing.",
    },
  ],
  sections: [
    {
      heading: "Reference forms",
      body: [
        "Everywhere crew accepts a skill reference (the argument to `install`, an entry in `metadata.crew.dependencies`, a dep in a SKILL.md), the same set of shapes is understood:",
        {
          literal: true,
          lines: [
            "Tap (skill name in a configured registry)",
            "  python-testing                     Bare name; searched across every tap.",
            "  core/python-testing                Qualified to the `core` tap.",
            "  core/python-testing@v1.0.0         Qualified and pinned to a tag.",
            "",
            "Local path (expanded at parse time)",
            "  ./my-skill                         Relative to cwd.",
            "  ../sibling/my-skill",
            "  /abs/path/my-skill",
            "  ~/code/team-skills/python-testing  Tilde expands to $HOME.",
            "",
            "Git URL (any reachable git remote)",
            "  https://github.com/acme/skills.git",
            "  https://gitlab.com/acme/skills",
            "  git@github.com:acme/skills.git     SSH style.",
            "  ssh://git@host/owner/repo.git",
            "  file:///abs/path/to/local.git      Local repo; handy for testing.",
            "",
            "Host shorthand (expands to an https URL)",
            "  gh:acme/skills                     → https://github.com/acme/skills.git",
            "  gl:acme/skills                     → https://gitlab.com/acme/skills.git",
            "  bb:acme/skills                     → https://bitbucket.org/acme/skills.git",
            "  @acme/skills                       → same as gh:acme/skills (GitHub alias).",
          ],
        },
        "Any git-shaped reference can carry a `@<ref>` tail to pin a tag, branch, or commit SHA, plus a `//<subpath>` to point at a directory inside the repo. The two combine — ref comes first:",
        {
          literal: true,
          lines: [
            "gh:acme/skills@v1.2.0                    Tag.",
            "gh:acme/skills@main                      Branch (follows the tip).",
            "gh:acme/skills@a1b2c3d                   Commit SHA (full or short).",
            "gh:acme/skills//python/testing           Subpath at HEAD.",
            "gh:acme/skills@v1.2.0//python/testing    Tag + subpath.",
            "@acme/skills@v1.0.0                      Works with leading-@ too.",
          ],
        },
        "A git or path source pointing at a directory with no root SKILL.md installs every skill it contains (one level deep), attributing them all to a single tap. If no tap already backs the URL/path, crew creates an auto tap. `crew update` re-expands that tap to pick up new skills added upstream.",
      ],
    },
  ],
  notes: [
    "Pinning: a `@<sha>` or `@<tag>` ref marks the install as pinned — `crew update` leaves it alone unless you pass `--force`.",
    "Disambiguation: bare names go to taps. Anything starting with `./`, `../`, `/`, `~`, `https://`, `git@`, `ssh://`, `file://`, `gh:`/`gl:`/`bb:`, or `@<owner>/<repo>` is a git-or-path source. A ref that contains `//` is always git (subpath syntax is git-only).",
  ],
  seeAlso: ["uninstall", "update", "info", "search"],
};
