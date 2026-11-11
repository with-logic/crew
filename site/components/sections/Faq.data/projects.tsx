/**
 * Homepage FAQ data: project manifests (`.crewrc`, PRD §9.2 and §9.3).
 */
import type { QA } from "./types";

export const PROJECTS: readonly QA[] = [
  {
    id: "crewrc",
    q: "How do I give everyone on a project the same skills?",
    a: (
      <>
        <p>
          Check in a <code>.crewrc</code> at the top of the project. It is a plain list, one skill
          reference per line: a git source such as <code>{"@acme/skills//review-checklist"}</code>,
          or a path inside the project such as <code>./tools/skills/release-notes</code>. Lines
          starting with <code>#</code> are comments.
        </p>
        <p>
          Running <code>crew install</code> with no arguments in the project installs what the file
          lists, for that project only. Delete a line and the next <code>crew install</code> removes
          that skill, unless another listed skill depends on it.{" "}
          <code>crew install --save &lt;ref&gt;</code> adds a line for you.
        </p>
        <p>
          Most teams add <code>crew install</code> to a setup step they already have, such as an npm{" "}
          <code>postinstall</code> script. It exits cleanly on a machine with no coding agent, so it
          is safe in CI.
        </p>
      </>
    ),
  },
  {
    id: "crewrc-lock",
    q: (
      <>
        What is <code>.crewrc.lock</code>, and should I commit it?
      </>
    ),
    a: (
      <>
        <p>
          Yes, commit it. When a line names a branch, a tag, or no version at all, Homecrew records
          the exact commit it installed in <code>.crewrc.lock</code>. Everyone who runs{" "}
          <code>crew install</code> after that gets the same commit, even if the branch has moved.
        </p>
        <p>You never edit it by hand. Homecrew writes it.</p>
      </>
    ),
  },
  {
    id: "crewrc-update",
    q: (
      <>
        How do skills from a <code>.crewrc</code> get updated?
      </>
    ),
    a: (
      <>
        <p>
          On purpose, and by a person. <code>crew update</code> and autoupdate leave those skills
          alone, so a project stays on the versions its lockfile records.
        </p>
        <p>
          To take newer versions, run <code>crew install --latest</code>, then commit the changed{" "}
          <code>.crewrc.lock</code>. The rest of the team gets them on their next{" "}
          <code>crew install</code>.
        </p>
      </>
    ),
  },
  {
    id: "crewrc-monorepo",
    q: (
      <>
        Does <code>.crewrc</code> work in a monorepo?
      </>
    ),
    a: (
      <>
        <p>
          Yes. Give each project its own <code>.crewrc</code>. Running <code>crew install</code> at
          the top of the repository installs every project&apos;s skills, each into its own project
          folder. Running it inside one project installs that project and anything beneath it.
        </p>
        <p>
          Homecrew finds the files through git, so a <code>.crewrc</code> inside an ignored
          directory such as <code>node_modules</code> is skipped.
        </p>
      </>
    ),
  },
];
