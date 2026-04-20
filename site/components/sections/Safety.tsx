import type { ReactNode } from "react";
import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./Safety.module.css";

const ITEMS: readonly {
  readonly sym: string;
  readonly title: string;
  readonly body: ReactNode;
}[] = [
  {
    sym: "fs",
    title: "No symlinks, ever.",
    body: (
      <>
        Every install is a file copy. Upgrades atomically rename into place. You can{" "}
        <code>rm -rf</code> a skill with no side effects.
      </>
    ),
  },
  {
    sym: "exec",
    title: "Never executes anything.",
    body: "No post-install hooks, no build steps, no user-supplied scripts run by crew. It copies files. Agents are what run them.",
  },
  {
    sym: "marker",
    title: "Tracks what it wrote.",
    body: (
      <>
        Every installed skill gets a <code>.crew.json</code> marker with its source, ref, SHA, and
        content hash. Removing a skill removes only what crew created.
      </>
    ),
  },
  {
    sym: "diff",
    title: "Detects your edits.",
    body: (
      <>
        On re-install, crew re-hashes the destination. If you've customized a managed skill, the
        install is refused — unless you pass <code>--force</code>.
      </>
    ),
  },
  {
    sym: "lock",
    title: "Concurrency-safe.",
    body: (
      <>
        Every write takes an advisory lock on <code>state.json.lock</code>. The background
        autoupdater and your interactive shell can't stomp on each other.
      </>
    ),
  },
  {
    sym: "sha",
    title: "Reproducible versions.",
    body: "Tags and branches resolve to full 40-char commit SHAs at install time. The SHA — not the tag — is what's recorded.",
  },
  {
    sym: "scope",
    title: "Owns only ~/.crew/.",
    body: (
      <>
        Crew writes to its own directory and to each agent's skills directory. It won't touch your
        global <code>AGENTS.md</code>, settings JSON, or anything else.
      </>
    ),
  },
  {
    sym: "doctor",
    title: "Auditable.",
    body: (
      <>
        <code>crew doctor</code> reconciles state, markers, and agent directories.{" "}
        <code>--repair</code> fixes drift without ever touching files you edited.
      </>
    ),
  },
];

export function Safety() {
  return (
    <Section id="safety" ruleTop>
      <Container>
        <SectionHead
          number="09"
          label="Safety model"
          title="Crew is a file copier."
          description="Crew is a file copier. It doesn't execute your skills, your taps, or anything they pull in. It leaves a paper trail you can audit, and it refuses to overwrite anything it didn't install itself."
        />
        <div className={styles.grid}>
          {ITEMS.map((i) => (
            <div key={i.sym} className={styles.item}>
              <span className={styles.sym}>{i.sym}</span>
              <h4 className={styles.title}>{i.title}</h4>
              <p className={styles.body}>{i.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
