import { Button } from "../primitives/Button";
import { Container } from "../primitives/Container";
import { Terminal } from "../primitives/Terminal";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero}>
      <Container>
        <div className={styles.grid}>
          <div>
            <h1 className={styles.title}>
              <code className={styles.brandCode}>crew</code> helps teams{" "}
              <span className={styles.accent}>share agent skills</span>.
            </h1>
            <p className={styles.lede}>
              Install a skill once and Homecrew copies it into every supported coding agent. Share
              team skills through git, then keep them current with <code>crew update</code>.
            </p>
            <div className={styles.ctaRow}>
              <Button href="#install">Install Homecrew</Button>
              <Button href="#how" variant="ghost">
                How it works
              </Button>
            </div>
          </div>
          <HeroTerminal />
        </div>
      </Container>
    </section>
  );
}

function HeroTerminal() {
  return (
    <Terminal title="~/work · zsh">
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>crew install founding-engineer</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>claude-code &nbsp;→ ~/.claude/skills/founding-engineer</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>
          codex &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ ~/.agents/skills/founding-engineer
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>
          gemini-cli &nbsp;&nbsp;→ ~/.agents/skills/founding-engineer
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.dim}>installed in 5 agents · 0 skipped · 0 failed</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>crew tap add @acme/skills</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>
          cloned <span className={styles.acc}>acme</span> → 42 skills searchable
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>crew install acme/team-baseline</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>
          resolved <span className={styles.acc}>14 dependencies</span> from tap{" "}
          <span className={styles.acc}>acme</span>
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>installed team baseline across every detected agent</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>crew autoupdate enable</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>checking every 4 hours</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.caret} />
      </div>
    </Terminal>
  );
}
