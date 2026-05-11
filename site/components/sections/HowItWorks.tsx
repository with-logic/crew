import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./HowItWorks.module.css";

const STEPS: readonly {
  readonly n: string;
  readonly title: string;
  readonly body: React.ReactNode;
}[] = [
  {
    n: "01",
    title: "Find great skills.",
    body: (
      <>
        Search across the default <code>core</code> collection, private taps, team repos, and
        anything else you've added. With a query, Homecrew can also point at trusted taps you
        haven't added yet.
      </>
    ),
  },
  {
    n: "02",
    title: "Tap into more sources.",
    body: (
      <>
        A <em>tap</em> is any git repo full of skills. Add your team's repo, a community collection,
        your own private one — <code>crew tap add</code> once, and every skill inside is searchable
        and installable.
      </>
    ),
  },
  {
    n: "03",
    title: "Install into every agent.",
    body: (
      <>
        One <code>crew install</code> copies the skill into Claude Code, Codex, Cursor, Gemini CLI,
        GitHub Copilot, Goose, and every other supported agent detected on your machine. Grab one
        skill, a local folder, a git repo, or a whole tap.
      </>
    ),
  },
  {
    n: "04",
    title: "Dependencies, handled.",
    body: (
      <>
        Skills can depend on other skills. Homecrew walks the graph and installs everything they
        need. A single "team baseline" meta-skill can pull in a dozen others in one command.
      </>
    ),
  },
  {
    n: "05",
    title: "Stay current automatically.",
    body: (
      <>
        <code>crew update</code> pulls the latest versions of everything. Flip on autoupdate and a
        background job keeps every agent fresh in the background.
      </>
    ),
  },
];

const DIAGRAM_ROWS: readonly {
  readonly name: string;
  readonly path: string;
  readonly status: string;
}[] = [
  { name: "claude-code", path: "~/.claude/skills/", status: "detected" },
  { name: "codex", path: "~/.agents/skills/", status: "detected" },
  { name: "cursor", path: "~/.agents/skills/", status: "detected" },
  { name: "gemini-cli", path: "~/.agents/skills/", status: "detected" },
];

export function HowItWorks() {
  return (
    <Section id="how" ruleTop>
      <Container>
        <SectionHead
          number="03"
          label="How it works"
          title="Find, install, update. Repeat."
          description="Five everyday motions. No proprietary manifest, no hosted account, no per-agent setup loop — just commands that do what they say."
        />

        <div className={styles.pipeline}>
          <div className={styles.steps}>
            {STEPS.map((s) => (
              <div key={s.n} className={styles.step}>
                <div className={styles.n}>{s.n}</div>
                <div>
                  <h4 className={styles.title}>{s.title}</h4>
                  <p className={styles.body}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          <aside className={styles.diagram}>
            <div className={styles.dTitle}>Agent adapters · showing 4 of 17</div>
            {DIAGRAM_ROWS.map((r) => (
              <div key={r.name} className={styles.dRow}>
                <span className={styles.dName}>{r.name}</span>
                <span className={styles.dPath}>{r.path}</span>
                <span className={styles.dStatus}>{r.status}</span>
              </div>
            ))}
            <div className={styles.dNote}>
              Each adapter knows its tool's skill directory at both{" "}
              <span className={styles.dEmph}>user</span> and{" "}
              <span className={styles.dEmph}>project</span> scope. Multiple agents that share the
              same convention (Codex, Cursor, Gemini, Goose, and others read{" "}
              <code>~/.agents/skills/</code>) share a single physical copy.
            </div>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
