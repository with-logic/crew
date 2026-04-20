import { Acc, Cmt, CodeBlock, Key, Ok, Prompt } from "../primitives/CodeBlock";
import { Container } from "../primitives/Container";
import { Eyebrow } from "../primitives/Eyebrow";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./Teams.module.css";

const CARDS: readonly {
  readonly kicker: string;
  readonly title: string;
  readonly body: React.ReactNode;
}[] = [
  {
    kicker: "One repo, every laptop",
    title: "Your team's skills repo is your registry.",
    body: (
      <>
        Point crew at a private GitHub repo once. Every new skill that lands on <code>main</code>{" "}
        shows up in everyone's <code>crew search</code>. No internal tool to build. No package
        server to run.
      </>
    ),
  },
  {
    kicker: "Onboarding, one command",
    title: "New hires are productive on day one.",
    body: (
      <>
        Publish a <code>team-baseline</code> meta-skill that depends on everything you consider
        standard — review checklists, on-call playbooks, style guides. A single{" "}
        <code>crew install</code> catches them up.
      </>
    ),
  },
  {
    kicker: "Review in PRs",
    title: "Skills get better like code does.",
    body: (
      <>
        Propose a change to the team's prompt library the same way you propose a change to anything
        else — a branch, a PR, comments, squash-merge. Everyone pulls the update on their next{" "}
        <code>crew update</code>.
      </>
    ),
  },
  {
    kicker: "Private by default",
    title: "Internal stays internal.",
    body: (
      <>
        Crew clones taps with whatever git credentials you already have. Your private repo stays
        private — crew never phones home, never uploads, never indexes anything outside the machines
        you install it on.
      </>
    ),
  },
];

export function Teams() {
  return (
    <Section id="teams" ruleTop>
      <Container>
        <SectionHead
          number="08"
          label="For teams"
          title="Fun for the whole team."
          description="The best skills on your team are trapped in one engineer's shell history. Crew gives your team a shared shelf — a private git repo that everyone installs from, reviews in PRs, and keeps in sync without thinking about it."
        />

        <div className={styles.grid}>
          {CARDS.map((c) => (
            <div key={c.kicker} className={styles.card}>
              <Eyebrow>{c.kicker}</Eyebrow>
              <h3 className={styles.title}>{c.title}</h3>
              <p className={styles.body}>{c.body}</p>
            </div>
          ))}
        </div>

        <div className={styles.codeWrap}>
          <CodeBlock>
            <Cmt># Monday, 9:04am. A new engineer opens their laptop.</Cmt>
            {"\n"}
            <Prompt /> crew tap add <Acc>@acme/skills</Acc>
            {"\n"}
            <Ok>✓</Ok> cloned <Key>acme</Key> → 42 skills available
            {"\n\n"}
            <Prompt /> crew install <Acc>acme/team-baseline</Acc>
            {"\n"}
            <Ok>✓</Ok> resolved 14 dependencies
            {"\n"}
            <Ok>✓</Ok> installed across every detected agent
            {"\n\n"}
            <Cmt># Monday, 9:06am. They know how the team ships code.</Cmt>
          </CodeBlock>
        </div>
      </Container>
    </Section>
  );
}
