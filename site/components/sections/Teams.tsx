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
        Point Homecrew at a private GitHub repo once. Every new skill that lands on{" "}
        <code>main</code> shows up in everyone's <code>crew search</code>. No internal tool to
        build. No package server to run.
      </>
    ),
  },
  {
    kicker: "Skills per project",
    title: "Check in a list. Everyone gets the same skills.",
    body: (
      <>
        Put a <code>.crewrc</code> in a project: one skill reference per line. Anyone who runs{" "}
        <code>crew install</code> there gets those skills, for that project, at the commits recorded
        in <code>.crewrc.lock</code>. Remove a line and the skill goes away on the next install.
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
        Homecrew clones taps with whatever git credentials you already have. Your private repo stays
        private — Homecrew never phones home, never uploads, never indexes anything outside the
        machines you install it on.
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
          title="Turn team know-how into installable skills."
          description="Your team's best agent playbooks should not be trapped on one engineer's laptop. Homecrew turns a private git repo into a shared package source, and a checked-in .crewrc gives every project the skills it expects, without another internal service."
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
            <Cmt># .crewrc, checked in at the top of the project</Cmt>
            {"\n"}
            <Acc>{"@acme/skills//review-checklist"}</Acc>
            {"\n"}
            <Acc>{"@acme/skills//oncall-playbook"}</Acc>
            {"\n"}
            <Acc>./tools/skills/release-notes</Acc>
            {"\n\n"}
            <Cmt># A new engineer clones the project and runs one command.</Cmt>
            {"\n"}
            <Prompt /> crew install
            {"\n"}
            <Ok>✓</Ok> installed 3 skills into this project, for every detected agent
            {"\n\n"}
            <Cmt># Or nobody runs it: add it to the setup step you already have.</Cmt>
            {"\n"}
            <Key>"postinstall"</Key>: "crew install"
          </CodeBlock>
        </div>
      </Container>
    </Section>
  );
}
