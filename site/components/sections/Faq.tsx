import type { ReactNode } from "react";
import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./Faq.module.css";

interface QA {
  readonly id: string;
  readonly q: ReactNode;
  readonly a: ReactNode;
  readonly defaultOpen?: boolean;
}

const QAS: readonly QA[] = [
  {
    id: "vs-others",
    defaultOpen: true,
    q: "How is this different from skills.sh or `gh skill`?",
    a: (
      <>
        <p>
          They're great projects too — different takes on the same problem. Crew leans hard into
          team workflows. A few things that are particular to crew:
        </p>
        <ul>
          <li>
            <strong>Taps.</strong> Point crew at a git repo once; every skill in it is searchable
            and installable. You can even just install the entire tap, and as skills are added to
            that tap, they'll get added to your machine when you run <code>crew update</code>.
          </li>
          <li>
            <strong>Skill dependencies.</strong> Skills can depend on other skills. Crew walks the
            graph and installs everything they need. A single <code>team-baseline</code> meta-skill
            can pull in a dozen others.
          </li>
          <li>
            <strong>Background autoupdate.</strong> <code>crew autoupdate enable</code> sets up a
            launchd agent that keeps every skill current.
          </li>
          <li>
            <strong>Local-edit protection.</strong> Crew hashes what it installs and refuses to
            clobber your edits on re-install — so you can tweak a skill in place and not lose your
            work the next time something updates.
          </li>
          <li>
            <strong>Private-first.</strong> Crew clones taps with whatever git credentials are on
            the machine — SSH, GitHub tokens, Enterprise hosts. No hosted middleman.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "solo",
    q: "Is crew useful if I don't have a team?",
    a: (
      <>
        <p>
          Yes. Crew is still a package manager for your own skills. Install a skill once and it
          lands in every detected agent. Add your personal skills repo as a tap and your library
          becomes searchable. Use a baseline skill to recreate your setup on a new Mac.
        </p>
        <p>
          The team features are the same primitives scaled up: git sources, taps, dependency
          resolution, source tracking, autoupdate, and local-edit protection.
        </p>
      </>
    ),
  },
  {
    id: "private-team",
    q: "How does crew work with a private team skills repo?",
    a: (
      <>
        <p>
          Same as any private git repo you clone. Add it as a tap:{" "}
          <code>crew tap add git@github.com:acme/skills.git</code>. Crew uses whatever credentials
          your git already has — SSH keys, personal access tokens, GitHub Enterprise hosts. Nothing
          gets uploaded anywhere; there's no intermediary registry.
        </p>
        <p>
          Every <code>main</code>-merge automatically becomes installable team-wide. Pair it with{" "}
          <code>crew autoupdate enable</code> and every Mac pulls approved skill updates on the next
          interval.
        </p>
      </>
    ),
  },
  {
    id: "dependencies",
    q: "Skills can depend on other skills?",
    a: (
      <>
        <p>
          Yes. A <code>SKILL.md</code>'s frontmatter can list{" "}
          <code>metadata.crew.dependencies</code> — an array of skill references in any form the CLI
          accepts. Crew walks the graph transitively and installs every dep before the parent.
        </p>
        <p>
          The most useful pattern is a "meta-skill" — a single skill whose body describes a team's
          conventions and whose <code>dependencies</code> list pulls in the real working skills.
          Onboarding a new engineer becomes one command.
        </p>
      </>
    ),
  },
  {
    id: "multi-agent",
    q: "Does one install really cover every coding agent?",
    a: (
      <>
        <p>
          Yes. <code>crew install founding-engineer</code> copies the skill into Claude Code, Codex,
          Cursor, Gemini CLI, GitHub Copilot, Goose, and every other{" "}
          <a href="#agents">supported agent</a> detected on the machine. Agents that share a
          convention (e.g. most read <code>~/.agents/skills/</code>) get one physical copy; the
          install summary reports each adapter by name.
        </p>
        <p>
          Don't have one of them? It's skipped silently. Add the agent later, run{" "}
          <code>crew update</code>, and it catches up.
        </p>
      </>
    ),
  },
  {
    id: "symlinks",
    q: "Why copies instead of symlinks?",
    a: "Symlinks break the moment two agents resolve a skill differently, or a user pins one agent to an older ref. Copies are dumb, predictable, and safe: each agent's directory is self-sufficient. The marginal disk cost is negligible — skills are markdown.",
  },
  {
    id: "edits",
    q: "What happens if I edit an installed skill?",
    a: (
      <>
        Crew records a content hash in the <code>.crew.json</code> marker at install time. On the
        next <code>crew install</code> or <code>crew update</code>, it recomputes the hash. If it
        differs, crew refuses to overwrite your changes and reports <code>customized</code>. You
        pass <code>--force</code> to override, or copy your edits into a new skill and install that
        instead.
      </>
    ),
  },
  {
    id: "registry",
    q: "Is there a hosted registry?",
    a: (
      <>
        No. The default tap <code>core</code> is a plain git repo. Anyone can host a tap — your
        team, your company, yourself. Crew never phones home or uploads your skills.
      </>
    ),
  },
  {
    id: "platforms",
    q: "What about Linux? Windows?",
    a: "Future work. The v1 spec is macOS-only because launchd is the autoupdate mechanism and each agent adapter encodes platform-specific paths. Nothing in the core design is Mac-specific; it's a scope decision, not a technical one.",
  },
];

export function Faq() {
  return (
    <Section id="faq" ruleTop>
      <Container>
        <SectionHead
          number="11"
          label="FAQ"
          title={
            <>
              Things people ask about <code>crew</code>.
            </>
          }
          description=""
        />
        <div className={styles.list}>
          {QAS.map((qa) => (
            <details key={qa.id} open={qa.defaultOpen}>
              <summary>
                <span>{qa.q}</span>
              </summary>
              <div className={styles.ans}>{typeof qa.a === "string" ? <p>{qa.a}</p> : qa.a}</div>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}
