import { Acc, Cmt, CodeBlock, Ok, Prompt, Warn } from "../primitives/CodeBlock";
import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";

export function Demo() {
  return (
    <Section id="demo" ruleTop>
      <Container>
        <SectionHead
          number="05"
          label="A day with crew"
          title="What using it actually feels like."
          description="Six commands that cover 90% of needs."
        />

        <CodeBlock>
          <Cmt># Find a skill across every tap you've added.</Cmt>
          {"\n"}
          <Prompt /> crew search <Acc>engineer</Acc>
          {'\n3 matches for "engineer"'}
          {"\n"}
          {"\n  core"}
          {
            "\n    founding-engineer  Ship like a founding engineer: bias to action, small PRs, obvious code."
          }
          {"\n    staff-engineer     Design docs, RFC etiquette, cross-team technical leadership."}
          {"\n"}
          {"\n  acme"}
          {"\n    platform-engineer  Team conventions for infra work and on-call handoffs."}
          {"\n\n"}
          <Cmt># Install one — it lands in every agent on your machine.</Cmt>
          {"\n"}
          <Prompt /> crew install <Acc>founding-engineer</Acc>
          {"\n"}
          <Ok>✓</Ok> founding-engineer@a1b2c3d installed in 5 agents
          {"\n\n"}
          <Cmt># Install straight from a repo, pinned to a tag, at a subpath.</Cmt>
          {"\n"}
          <Prompt /> crew install <Acc>{"@acme/skills@v1.2.0//engineers/founding"}</Acc>
          {"\n\n"}
          <Cmt># See what's installed.</Cmt>
          {"\n"}
          <Prompt /> crew list
          {"\n"}
          <Warn>Installed skills (3)</Warn>
          {"\n  founding-engineer   core         a1b2c3d   5 agents"}
          {"\n  code-review         core         d4e5f6a   5 agents"}
          {"\n  platform-engineer   acme@v1.2.0  9c8b7a6   5 agents"}
          {"\n"}
          {"\n  Run `crew info <name>` to see more about any of these."}
          {"\n\n"}
          <Cmt># Pull the latest versions of everything.</Cmt>
          {"\n"}
          <Prompt /> crew update
          {"\n"}
          <Ok>✓</Ok> founding-engineer a1b2c3d → e8f9a01 (5 agents)
          {"\n"}
          <Ok>✓</Ok> code-review up to date
          {"\n"}
          <Ok>✓</Ok> platform-engineer pinned @ v1.2.0, skipped
          {"\n\n"}
          <Cmt># Run crew update in the background every 4 hours.</Cmt>
          {"\n"}
          <Prompt /> crew autoupdate enable
          {"\n"}
          <Ok>✓</Ok> Autoupdate enabled
          {"\n  checking every 4 hours"}
          {"\n  see progress in `crew autoupdate status`"}
        </CodeBlock>
      </Container>
    </Section>
  );
}
