import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./Problem.module.css";

const CELLS: readonly {
  readonly num: string;
  readonly subtitle: string;
  readonly title: string;
  readonly body: React.ReactNode;
}[] = [
  {
    num: "01",
    subtitle: "use your own",
    title: "Install skills without manual copying.",
    body: (
      <>
        Point crew at a local directory, a git repo, or a tap entry. It validates the{" "}
        <code>SKILL.md</code>, copies it into the right agent directories, and records what it
        wrote.
      </>
    ),
  },
  {
    num: "02",
    subtitle: "share with a team",
    title: "Your skills repo is your registry.",
    body: (
      <>
        Point crew at a shared repo — a <em>tap</em> — and everyone pulls the same skills, reviewed
        in PRs and versioned in git. A baseline skill can onboard a new laptop in one command.
      </>
    ),
  },
  {
    num: "03",
    subtitle: "stay current",
    title: "Update skills like packages.",
    body: (
      <>
        <code>crew update</code> refreshes taps, resolves refs to commit SHAs, skips pinned skills,
        and refuses to overwrite local edits unless you explicitly force it.
      </>
    ),
  },
];

export function Problem() {
  return (
    <Section id="why">
      <Container>
        <SectionHead
          number="01"
          label="Why crew"
          title="Package-manager workflows for agent skills."
          description="The best prompts and agent playbooks often live as copied folders, gists, or private notes. Crew gives them install commands, source tracking, update behavior, and a git-native way to share them without a hosted registry."
        />
        <div className={styles.grid}>
          {CELLS.map((c) => (
            <div key={c.num} className={styles.cell}>
              <div className={styles.num}>
                {c.num} / {c.subtitle}
              </div>
              <h3 className={styles.title}>{c.title}</h3>
              <p className={styles.body}>{c.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
