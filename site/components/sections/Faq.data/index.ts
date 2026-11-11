/**
 * Homepage FAQ data: every question, in the order the page shows them.
 */

import { GENERAL } from "./general";
import { PROJECTS } from "./projects";
import type { QA } from "./types";

/** Project questions sit right after the first general ones, beside the team questions. */
const LAST_TEAM_QUESTION: (typeof GENERAL)[number]["id"] = "private-team";
const TEAM_QUESTIONS_END = GENERAL.findIndex((qa) => qa.id === LAST_TEAM_QUESTION) + 1;

export const QAS: readonly QA[] = [
  ...GENERAL.slice(0, TEAM_QUESTIONS_END),
  ...PROJECTS,
  ...GENERAL.slice(TEAM_QUESTIONS_END),
];
