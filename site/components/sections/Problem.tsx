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
    subtitle: "share with your team",
    title: "One command. Same skills on every laptop.",
    body: (
      <>
        Onboard a new hire in two minutes. Roll out a workflow change to the whole team in one PR.
        Keep everyone's agents in sync without anyone having to think about it.
      </>
    ),
  },
  {
    num: "02",
    subtitle: "share with peers",
    title: "Publish a skill.",
    body: (
      <>
        Any git repo with a <code>SKILL.md</code> at the root is installable. Push to GitHub, send
        the link — <code>crew install @you/skill</code> and your friend has it. Skills install their
        dependencies, so one link can onboard a whole workflow.
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
          title="The best skills on your team are trapped on other engineers' computers."
          description="Right now, the prompts and agent playbooks that actually work sit on one person's machine or get copy-pasted through gists and Slack messages nobody keeps current. Crew gives your team a shared shelf — a private git repo everyone installs from, reviews in PRs, and keeps in sync without thinking about it."
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
