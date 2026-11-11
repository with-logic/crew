/**
 * Homepage FAQ data: every question, in the order the page shows them.
 */
import type { QA } from "../Faq.types";
import { GENERAL } from "./general";
import { PROJECTS } from "./projects";

/** Project questions sit right after the first general ones, beside the team questions. */
const TEAM_QUESTIONS_END = GENERAL.findIndex((qa) => qa.id === "private-team") + 1;

export const QAS: readonly QA[] = [
  ...GENERAL.slice(0, TEAM_QUESTIONS_END),
  ...PROJECTS,
  ...GENERAL.slice(TEAM_QUESTIONS_END),
];
