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
            <p className={styles.kicker}>
              <span className={styles.sq} />
              open source
              <span className={styles.sep}>/</span>
              <span className={styles.os}>MIT</span>
            </p>
            <h1 className={styles.title}>
              <code className={styles.brandCode}>crew</code> is a package manager{" "}
              <span className={styles.accent}>for agent skills</span>.
            </h1>
            <p className={styles.lede}>
              Find great skills. Install them with one command into every coding agent on your
              machine. Share your own as easily as pushing to GitHub.
            </p>
            <div className={styles.ctaRow}>
              <Button href="#install">Install crew →</Button>
              <Button href="#how" variant="ghost">
                How it works
              </Button>
              <Button href="#commands" variant="ghost">
                Command reference
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
        <span className={styles.dim}>
          resolving <span className={styles.acc}>founding-engineer</span> from tap{" "}
          <span className={styles.acc}>core</span>…
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.dim}>
          fetched <span className={styles.acc}>core</span> @{" "}
          <span className={styles.acc}>a1b2c3d</span> · validated SKILL.md
        </span>
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
          codex &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ ~/.agents/skills/founding-engineer
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>gemini-cli &nbsp;→ ~/.agents/skills/founding-engineer</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.dim}>installed in 3 agents · 0 skipped · 0 failed</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.caret} />
      </div>
    </Terminal>
  );
}
