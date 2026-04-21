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
    subtitle: "share with peers",
    title: "Publish a skill.",
    body: (
      <>
        Any git repo with a <code>SKILL.md</code> at the root is installable. Push to GitHub, send
        the link — <code>crew install @you/skill</code> and your friend has it.
      </>
    ),
  },
  {
    num: "02",
    subtitle: "share with your team",
    title: "Your skills repo is your registry.",
    body: (
      <>
        Point crew at a shared repo — a <em>tap</em> — and everyone on the team pulls the same
        skills, reviewed in PRs, versioned in git. Onboarding is one command.
      </>
    ),
  },
  {
    num: "03",
    subtitle: "share with the industry",
    title: "Discover what actually works.",
    body: (
      <>
        Browse the default <code>core</code> tap and community taps for battle-tested skills —
        review conventions, language idioms, framework playbooks. Fork, tweak, publish your own.
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
          title="Your team has great skills. You should have all of them."
          description="Right now, the best prompts and agent playbooks either sit on one person's machine or get copy-pasted through gists and Slack messages that nobody keeps current. Crew gives them a home, a way to be shared, and kept up to date. Anyone can publish. Anyone can install."
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
