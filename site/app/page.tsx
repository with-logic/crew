import { Agents } from "../components/sections/Agents";
import { AgentsStrip } from "../components/sections/AgentsStrip";
import { BottomCTA } from "../components/sections/BottomCTA";
import { Commands } from "../components/sections/Commands";
import { Demo } from "../components/sections/Demo";
import { Faq } from "../components/sections/Faq";
import { Footer } from "../components/sections/Footer";
import { Hero } from "../components/sections/Hero";
import { HowItWorks } from "../components/sections/HowItWorks";
import { Install } from "../components/sections/Install";
import { Nav } from "../components/sections/Nav";
import { Problem } from "../components/sections/Problem";
import { Safety } from "../components/sections/Safety";
import { SkillMdExample } from "../components/sections/SkillMdExample";
import { SkillRefs } from "../components/sections/SkillRefs";
import { Taps } from "../components/sections/Taps";
import { Teams } from "../components/sections/Teams";
import { ValueProp } from "../components/sections/ValueProp";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <BottomCTA />
        <Hero />
        <AgentsStrip />
        <Install />
        <ValueProp />
        <Problem />
        <HowItWorks />
        <SkillRefs />
        <Demo />
        <Commands />
        <Taps />
        <Teams />
        <Safety />
        <SkillMdExample />
        <Faq />
        <Agents />
      </main>
      <Footer />
    </>
  );
}
