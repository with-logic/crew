/**
 * Generated known-tap registry data for anthropic-healthcare (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_HEALTHCARE_KNOWN_TAP = {
  "name": "anthropic-healthcare",
  "url": "https://github.com/anthropics/healthcare.git",
  "subpath": "",
  "description": "Anthropic healthcare skills for prior authorization review, clinical trial protocols, and FHIR development.",
  "trust": "official",
  "skills": [
    {
      "name": "clinical-trial-protocol-skill",
      "namespace": null,
      "description": "Generate clinical trial protocols for medical devices or drugs. This skill should be used when users say \"Create a clinical trial protocol\", \"Generate protocol for [device/drug]\", \"Help me design a clinical study\", \"Research similar trials for [intervention]\", or when developing FDA submission documentation for investigational products.",
      "path": "clinical-trial-protocol-skill"
    },
    {
      "name": "fhir-developer-skill",
      "namespace": null,
      "description": "FHIR API development guide for building healthcare endpoints. Use when: (1) Creating FHIR REST endpoints (Patient, Observation, Encounter, Condition, MedicationRequest), (2) Validating FHIR resources and returning proper HTTP status codes and error responses, (3) Implementing SMART on FHIR authorization and OAuth scopes, (4) Working with Bundles, transactions, batch operations, or search pagination. Covers FHIR R4 resource structures, required fields, value sets (status codes, gender, intent), coding systems (LOINC, SNOMED, RxNorm, ICD-10), and OperationOutcome error handling.\n",
      "path": "fhir-developer-skill"
    },
    {
      "name": "prior-auth-review-skill",
      "namespace": null,
      "description": "Automate payer review of prior authorization (PA) requests. This skill should be used when users say \"Review this PA request\", \"Process prior authorization for [procedure]\", \"Assess medical necessity\", \"Generate PA decision\", or when processing clinical documentation for coverage policy validation and authorization decisions.",
      "path": "prior-auth-review-skill"
    }
  ]
} as const satisfies KnownTap;
