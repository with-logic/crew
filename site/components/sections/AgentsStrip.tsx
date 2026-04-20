import { AGENTS } from "../../lib/agents";
import { Chip } from "../primitives/Chip";
import { Container } from "../primitives/Container";
import styles from "./AgentsStrip.module.css";

const FEATURED_AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "goose"] as const;

export function AgentsStrip() {
  const remaining = AGENTS.length - FEATURED_AGENTS.length;
  return (
    <Container>
      <div className={styles.strip}>
        <span className={styles.label}>Installs into</span>
        {FEATURED_AGENTS.map((name) => (
          <Chip key={name} dot>
            {name}
          </Chip>
        ))}
        <a className={styles.more} href="#agents">
          and {remaining} others →
        </a>
      </div>
    </Container>
  );
}
