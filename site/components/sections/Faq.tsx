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
    id: "symlinks",
    defaultOpen: true,
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
    id: "new-agent",
    q: "How do I add support for a new agent?",
    a: (
      <>
        Write an adapter — six methods: <code>detect</code>, <code>user_path</code>,{" "}
        <code>project_path</code>, <code>install</code>, <code>uninstall</code>,{" "}
        <code>list_installed</code>. Register it. The install pipeline is tool-agnostic; adapters
        just know where the files go.
      </>
    ),
  },
  {
    id: "registry",
    q: "Is there a hosted registry?",
    a: (
      <>
        No. The default tap <code>core</code> is a plain git repo. Anyone can host a tap — your
        team, your company, yourself. Crew never phones home.
      </>
    ),
  },
  {
    id: "update-skip",
    q: (
      <>
        How does <code>crew update</code> know when to skip a skill?
      </>
    ),
    a: (
      <>
        Skills pinned to an exact SHA are skipped unless <code>--force</code>. Skills pinned to a
        tag are re-resolved: if the tag moved and <code>--force</code> is given, the new commit is
        installed. Everything else (branches, default branches, bare tap references) updates to
        whatever the ref resolves to now.
      </>
    ),
  },
  {
    id: "platforms",
    q: "What about Linux? Windows?",
    a: "Future work. The v1 spec is macOS-only because launchd is the autoupdate mechanism and each agent adapter encodes platform-specific paths. Nothing in the core design is Mac-specific; it's a scope decision, not a technical one.",
  },
  {
    id: "cross-tap-dep",
    q: "Can a skill depend on another skill in a different tap?",
    a: "Yes. Dependency references are full skill references — any form the CLI accepts. You can depend on a bare name (resolved across taps), a qualified tap name, a git URL with a ref, or a subpath inside a monorepo.",
  },
  {
    id: "project-git",
    q: (
      <>
        Does <code>project</code> scope interact with git?
      </>
    ),
    a: (
      <>
        Not automatically. <code>--scope project</code> writes into the agent's project-local skills
        directory relative to your current working directory. Whether you commit that directory is
        up to you. Many teams do; it means cloning a repo gives you its skills, no{" "}
        <code>crew install</code> required.
      </>
    ),
  },
];

export function Faq() {
  return (
    <Section id="faq" ruleTop>
      <Container>
        <SectionHead
          number="11"
          label="FAQ"
          title="Things people ask before they install it."
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
