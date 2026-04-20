import { Chip } from "../primitives/Chip";
import { Container } from "../primitives/Container";
import styles from "./AgentsStrip.module.css";

const FEATURED_AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "goose"] as const;

export function AgentsStrip() {
  return (
    <Container>
      <div className={styles.strip}>
        <span className={styles.label}>Installs into</span>
        {FEATURED_AGENTS.map((name) => (
          <Chip key={name} dot>
            {name}
          </Chip>
        ))}
        <span className={styles.trail}>
          &mdash; and every agent whose skill layout follows the{" "}
          <a href="https://agentskills.io/specification">Agent Skills spec</a>.
        </span>
      </div>
    </Container>
  );
}
