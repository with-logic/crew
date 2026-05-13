import { SAAP_FULL_PROMPT } from "../../lib/prd";
import { CREW_VERSION_TAG } from "../../lib/version";
import { Acc, CodeBlock } from "../primitives/CodeBlock";
import { Container } from "../primitives/Container";
import { CopyButton } from "../primitives/CopyButton";
import { Section } from "../primitives/Section";
import { BuildItYourself } from "./BuildItYourself";
import styles from "./Install.module.css";

const INSTALL_COMMAND = "curl -fsSL https://crew.logic.inc/install.sh | sh";
const CREW_VERSION = CREW_VERSION_TAG.replace(/^v/, "");

export function Install() {
  return (
    // Anchor target sits on the <Section> element itself. `scroll-margin-top`
    // applied globally to `[id]` in globals.css pushes the scroll stop down
    // past the sticky nav when #install is hit.
    <Section id="install" ruleTop className={styles.section}>
      <Container>
        {/* Install-specific header: keeps the `§ 02 Installation` meta label
            floating on the left like other sections, but centers the title
            above the install box so it visually anchors it. */}
        <header className={styles.head}>
          <div className={styles.num}>
            § 02&nbsp;&nbsp;<strong>Installation</strong>
          </div>
          <h2 className={styles.title}>Install Homecrew</h2>
        </header>

        <div className={styles.card}>
          <CodeBlock>
            {"$ curl -fsSL "}
            <Acc>https://crew.logic.inc/install.sh</Acc>
            {" | sh\n$ crew version\ncrew "}
            <Acc>{CREW_VERSION}</Acc>
            {" (darwin-arm64)"}
          </CodeBlock>
          <div className={styles.copy}>
            <CopyButton text={INSTALL_COMMAND} label="Copy install command" />
          </div>
        </div>

        <div className={styles.reqRow}>
          <span className={styles.reqPill}>
            <AppleGlyph />
            Requires macOS 13+
          </span>
        </div>

        <p className={styles.footnote}>
          A single binary. Drops itself in <code>~/.local/bin/crew</code>, plus whatever skills you
          install go under <code>~/.crew/</code> and into your agents' skills directories. The
          installer verifies the signed release checksum before installing. Uninstall with{" "}
          <code>rm -rf ~/.crew &amp;&amp; rm ~/.local/bin/crew</code>.
        </p>

        <BuildItYourself prompt={SAAP_FULL_PROMPT} />
      </Container>
    </Section>
  );
}

function AppleGlyph() {
  return (
    <svg
      className={styles.apple}
      width="14"
      height="14"
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}
