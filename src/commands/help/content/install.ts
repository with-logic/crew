import type { CommandHelp } from "./types.ts";

export const installHelp: CommandHelp = {
  name: "install",
  synopsis: "crew install <skill> [<skill>...] | crew install --from-git <source>",
  summary: [
    "Install a skill and make it available in every agent coder on your machine.",
    "Homecrew installs the same skill into every supported agent coder you have — Claude Code, Codex, Cursor, Gemini, and more. One command, all your agents. You don't have to think about where the skill goes; Homecrew figures out the right place for each tool.",
    "You can install by name (from a collection you've already added), by GitHub URL, from any git repo, or from a local folder — see REFERENCE FORMS below for the full list of shapes you can pass.",
    "If a name isn't in your taps but appears in a trusted tap you haven't added yet, Homecrew tells you the tap to add first.",
    "Point at a folder full of skills and you get all of them at once. New ones added later show up automatically when you run `crew update`.",
  ],
  flags: [
    {
      flag: "--scope {user,project}",
      description: "Install for yourself everywhere (default), or only inside the current project.",
    },
    {
      flag: "--agent <name>",
      description:
        "Only install into the named agent(s). Repeatable. See `crew agents` for what's available.",
    },
    {
      flag: "--dry-run",
      description: "Show what would happen without writing anything.",
    },
    {
      flag: "--force",
      description:
        "Overwrite a skill you've edited locally, or a folder Homecrew didn't create. Won't push through a real name conflict or a broken skill — those errors deserve your attention.",
    },
    {
      flag: "--recursive",
      description:
        "For direct git/path sources, fall back to bounded recursive discovery when standard tap layouts find no skills.",
    },
    {
      flag: "--from-git <git-source>",
      description:
        "Install from a git source, no guessing. Handy when a bare `owner/repo` would otherwise be read as a tap name — `--from-git acme/skills` means GitHub.",
    },
    { flag: "--json", description: "Machine-readable output." },
  ],
  examples: [
    {
      command: "crew install python-testing",
      description: "Install a skill by name from one of your collections.",
    },
    {
      command: "crew install @with-logic/skills",
      description: "Install every skill in a GitHub repo; new ones show up on `crew update`.",
    },
    {
      command: "crew install --recursive @acme/monorepo",
      description: "Install skills nested inside a trusted non-standard repository.",
    },
    {
      command: "crew install team-skills",
      description: "Install every skill in a collection you've already added.",
    },
    {
      command: "crew install gh:acme/skills@v1.2.0//python/testing",
      description: "Install a specific skill, pinned to a release, from a subfolder of a repo.",
    },
    {
      command: "crew install ./my-skill",
      description: "Install a skill you're developing locally.",
    },
    {
      command: "crew install --from-git acme/skills",
      description: "Force a git interpretation: `acme/skills` is the GitHub repo, not a tap.",
    },
    {
      command: "crew install --scope project team/conventions",
      description: "Only for the current project, not system-wide.",
    },
    {
      command: "crew install --dry-run --agent claude-code python-testing",
      description: "Preview what would land in Claude Code, without writing anything.",
    },
  ],
  sections: [
    {
      heading: "Reference forms",
      body: [
        "Wherever Homecrew accepts a skill — on the command line, in another skill's dependency list — the same shapes work. Pick whichever is convenient.",
        {
          literal: true,
          lines: [
            "By name (from a collection you've added)",
            "  python-testing                     Just the skill name.",
            "  core/python-testing                From a specific collection.",
            "  core/python-testing@v1.0.0         Pinned to a release tag.",
            "",
            "From a folder on your machine",
            "  ./my-skill                         Relative to where you are.",
            "  ../sibling/my-skill",
            "  /abs/path/my-skill",
            "  ~/code/team-skills/python-testing  Tilde expands to your home dir.",
            "",
            "From any git repo",
            "  https://github.com/acme/skills.git",
            "  https://gitlab.com/acme/skills",
            "  git@github.com:acme/skills.git     SSH style.",
            "  ssh://git@host/owner/repo.git",
            "  file:///abs/path/to/local.git      Local clone; great for testing.",
            "",
            "Pasted from your browser (GitHub, GitLab, Bitbucket)",
            "  https://github.com/acme/skills/tree/main/python/testing",
            "  https://github.com/acme/skills/blob/main/python/testing/SKILL.md",
            "  https://github.com/acme/skills/releases/tag/v1.2.0",
            "  https://gitlab.com/acme/skills/-/tree/main/python/testing",
            "",
            "Shorthand for the big hosts",
            "  gh:acme/skills                     → GitHub.",
            "  gl:acme/skills                     → GitLab.",
            "  bb:acme/skills                     → Bitbucket.",
            "  @acme/skills                       → Same as gh: — a handy GitHub alias.",
          ],
        },
        "Any git reference can pin a version with `@<tag>`, `@<branch>`, or `@<sha>`, and can point at a subfolder with `//<path>`. You can combine them, with the version either before or after the subfolder:",
        {
          literal: true,
          lines: [
            "gh:acme/skills@v1.2.0                    A specific release.",
            "gh:acme/skills@main                      Whatever's on the `main` branch.",
            "gh:acme/skills@a1b2c3d                   A specific commit.",
            "gh:acme/skills//python/testing           Just the `python/testing` subfolder.",
            "gh:acme/skills@v1.2.0//python/testing    Subfolder, pinned to a release.",
            "gh:acme/skills//python/testing@v1.2.0    Same thing, version last.",
            "@acme/skills@v1.0.0                      Same with the `@` shorthand.",
          ],
        },
        "Point at a whole repo (or any folder of skills) and Homecrew installs all of them. Later, when you run `crew update`, any new skills the authors have added come along for the ride.",
      ],
    },
  ],
  notes: [
    "Pinning keeps a skill put. Anything with `@<tag>` or `@<sha>` is treated as pinned — `crew update` leaves it alone unless you ask for `--force`.",
    "Known-tap suggestions are local hints. Homecrew won't clone or add the suggested tap until you run the shown `crew tap add` command.",
    "How Homecrew tells names apart: a plain word is a skill name. Paths start with `./`, `../`, `/`, or `~`. Git URLs start with `https://`, `git@`, `ssh://`, `file://`, `gh:`, `gl:`, `bb:`, or `@<owner>/<repo>`. Anything containing `//` is always treated as a git reference (that's the subfolder syntax).",
    "Browser links: a `/tree/<branch>/<folder>` link becomes `@<branch>//<folder>`, and a `/blob/.../SKILL.md` link points at the skill's folder. The first segment after `tree/` is taken as the branch, so for a branch name with a `/` in it use the explicit form instead — `crew install https://github.com/acme/skills@feature/new-api//python` installs the `python` folder from the `feature/new-api` branch.",
    "Private repos: a URL with credentials in it (`https://<user>:<token>@host/...`) works, and Homecrew never prints the token back at you — it's masked in every message and in `--json` output.",
    "Folder names containing `@`: write the version first. `gh:acme/skills@main//skills/foo@bar` installs the `skills/foo@bar` folder from `main`, because a version spelled before the subfolder stops Homecrew looking for one at the end.",
  ],
  seeAlso: ["uninstall", "update", "info", "search"],
};
