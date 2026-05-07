/**
 * Command reference section layout for the homepage (§16.6).
 */

import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import { GROUPS } from "./Commands.data";
import styles from "./Commands.module.css";

export function Commands() {
  return (
    <Section id="commands" ruleTop>
      <Container>
        <SectionHead
          number="06"
          label="Command reference"
          title="Everything the CLI can do."
          description={
            <>
              Every command accepts <code>--scope</code>, <code>--agent</code>,{" "}
              <code>--dry-run</code>, <code>--json</code>, <code>--quiet</code>,{" "}
              <code>--verbose</code>, <code>--yes</code>, and <code>--force</code> where they apply.
              Run <code>crew help &lt;command&gt;</code> for examples.
            </>
          }
        />

        <div className={styles.groups}>
          <nav className={styles.nav}>
            <ul>
              {GROUPS.map((g) => (
                <li key={g.id}>
                  <a href={`#${g.id}`}>
                    <span>{g.label}</span>
                    <span className={styles.n}>{String(g.commands.length).padStart(2, "0")}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            {GROUPS.map((g) => (
              <div key={g.id} id={g.id} className={styles.group}>
                <h3 className={styles.groupTitle}>{g.label}</h3>
                {g.commands.map((c) => (
                  <div key={c.name} className={styles.row}>
                    <div className={styles.sig}>{c.signature}</div>
                    <div className={styles.desc}>{c.description}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
