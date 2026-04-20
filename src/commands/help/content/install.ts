import type { CommandHelp } from "./types.ts";

export const installHelp: CommandHelp = {
  name: "install",
  synopsis: "crew install <skill> [<skill>...]",
  summary: [
    "Install a skill and make it available in every agent coder on your machine.",
    "crew installs the same skill into Claude Code, Codex, Gemini — whichever ones you have. One command, all your agents. You don't have to think about where the skill goes; crew figures out the right place for each tool.",
    "You can install by name (from a collection you've already added), by GitHub URL, from any git repo, or from a local folder — see REFERENCE FORMS below for the full list of shapes you can pass.",
    "Point at a folder full of skills and you get all of them at once. New ones added later show up automatically when you run `crew update`.",
  ],
  flags: [
    {
      flag: "--scope {user,project}",
      description: "Install for yourself everywhere (default), or only inside the current project.",
    },
    {
      flag: "--target <name>",
      description:
        "Only install into the named agent(s). Repeatable. See `crew targets` for what's available.",
    },
    {
      flag: "--dry-run",
      description: "Show what would happen without writing anything.",
    },
    {
      flag: "--force",
      description:
        "Overwrite a skill you've edited locally, or a folder crew didn't create. Won't push through a real name conflict or a broken skill — those errors deserve your attention.",
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
      command: "crew install --scope project team/conventions",
      description: "Only for the current project, not system-wide.",
    },
    {
      command: "crew install --dry-run --target claude-code python-testing",
      description: "Preview what would land in Claude Code, without writing anything.",
    },
  ],
  sections: [
    {
      heading: "Reference forms",
      body: [
        "Wherever crew accepts a skill — on the command line, in another skill's dependency list — the same shapes work. Pick whichever is convenient.",
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
            "Shorthand for the big hosts",
            "  gh:acme/skills                     → GitHub.",
            "  gl:acme/skills                     → GitLab.",
            "  bb:acme/skills                     → Bitbucket.",
            "  @acme/skills                       → Same as gh: — a handy GitHub alias.",
          ],
        },
        "Any git reference can pin a version with `@<tag>`, `@<branch>`, or `@<sha>`, and can point at a subfolder with `//<path>`. You can combine them — version first:",
        {
          literal: true,
          lines: [
            "gh:acme/skills@v1.2.0                    A specific release.",
            "gh:acme/skills@main                      Whatever's on the `main` branch.",
            "gh:acme/skills@a1b2c3d                   A specific commit.",
            "gh:acme/skills//python/testing           Just the `python/testing` subfolder.",
            "gh:acme/skills@v1.2.0//python/testing    Subfolder, pinned to a release.",
            "@acme/skills@v1.0.0                      Same with the `@` shorthand.",
          ],
        },
        "Point at a whole repo (or any folder of skills) and crew installs all of them. Later, when you run `crew update`, any new skills the authors have added come along for the ride.",
      ],
    },
  ],
  notes: [
    "Pinning keeps a skill put. Anything with `@<tag>` or `@<sha>` is treated as pinned — `crew update` leaves it alone unless you ask for `--force`.",
    "How crew tells names apart: a plain word is a skill name. Paths start with `./`, `../`, `/`, or `~`. Git URLs start with `https://`, `git@`, `ssh://`, `file://`, `gh:`, `gl:`, `bb:`, or `@<owner>/<repo>`. Anything containing `//` is always treated as a git reference (that's the subfolder syntax).",
  ],
  seeAlso: ["uninstall", "update", "info", "search"],
};
