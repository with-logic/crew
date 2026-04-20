import { Acc, CodeBlock } from "../primitives/CodeBlock";
import { Container } from "../primitives/Container";
import { Eyebrow } from "../primitives/Eyebrow";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./Install.module.css";

export function Install() {
  return (
    <Section id="install" ruleTop>
      <Container>
        <SectionHead
          number="02"
          label="Installation"
          title="Installation."
          description={
            <>
              A single macOS binary. Drops nothing on your system outside of <code>~/.crew/</code>{" "}
              and whichever agent skills directories you install into. Uninstall with{" "}
              <code>rm -rf ~/.crew &amp;&amp; rm /usr/local/bin/crew</code>.
            </>
          }
        />

        <div className={styles.grid}>
          <div>
            <Eyebrow>Homebrew</Eyebrow>
            <CodeBlock>
              {"$ brew install "}
              <Acc>with-logic/tap/crew</Acc>
              {"\n$ crew version\ncrew "}
              <Acc>0.3.1</Acc>
              {" (darwin-arm64)"}
            </CodeBlock>
          </div>
          <div>
            <Eyebrow>Curl</Eyebrow>
            <CodeBlock>
              {"$ curl -fsSL "}
              <Acc>https://crew.logic.inc/install.sh</Acc>
              {" | sh\n$ crew version\ncrew "}
              <Acc>0.3.1</Acc>
              {" (darwin-arm64)"}
            </CodeBlock>
          </div>
        </div>

        <div className={styles.requirements}>
          <span className={styles.reqBadge}>req</span>
          <div>
            <strong className={styles.reqStrong}>Requires:</strong> macOS 13+ (Ventura or later),{" "}
            <code>git</code> on <code>PATH</code>, and <code>launchctl</code> (present on every
            macOS). Linux and Windows support is tracked but not shipping in v1.
          </div>
        </div>
      </Container>
    </Section>
  );
}
