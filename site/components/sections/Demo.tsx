import { Acc, Cmt, CodeBlock, Key, Ok, Prompt, Warn } from "../primitives/CodeBlock";
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
          description="Six commands that cover roughly 90% of what you'll ever type."
        />

        <CodeBlock>
          <Cmt># Find a skill across every tap you've added.</Cmt>
          {"\n"}
          <Prompt /> crew search <Acc>engineer</Acc>
          {
            "\ncore/founding-engineer    Ship like a founding engineer: bias to action, small PRs, obvious code."
          }
          {
            "\ncore/staff-engineer       Design docs, RFC etiquette, cross-team technical leadership."
          }
          {"\nacme/platform-engineer    Team conventions for infra work and on-call handoffs."}
          {"\n\n"}
          <Cmt># Install one — it lands in every agent on your machine.</Cmt>
          {"\n"}
          <Prompt /> crew install <Acc>founding-engineer</Acc>
          {"\n"}
          <Ok>✓</Ok> claude-code · codex · cursor · gemini-cli · goose
          {"\n\n"}
          <Cmt># Install straight from a repo, pinned to a tag, at a subpath.</Cmt>
          {"\n"}
          <Prompt /> crew install <Acc>{"@acme/skills@v1.2.0//engineers/founding"}</Acc>
          {"\n\n"}
          <Cmt># See what's installed, grouped by scope.</Cmt>
          {"\n"}
          <Prompt /> crew list
          {"\n"}
          <Warn>user</Warn>
          {"\n  founding-engineer     core           a1b2c3d   5 agents"}
          {"\n  code-review           core           d4e5f6a   5 agents"}
          {"\n  platform-engineer     acme/v1.2.0    9c8b7a6   5 agents"}
          {"\n"}
          <Warn>project</Warn> <Cmt>(/Users/you/work/api)</Cmt>
          {"\n  api-review-checklist  ./skills/review    —     5 agents"}
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
          <Cmt># Run it in the background every 4 hours.</Cmt>
          {"\n"}
          <Prompt /> crew autoupdate enable
          {"\n"}
          <Ok>✓</Ok> launchd agent <Key>sh.crew.autoupdate</Key> loaded (interval: 4h)
        </CodeBlock>
      </Container>
    </Section>
  );
}
