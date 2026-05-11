/**
 * Generated known-tap registry data for stripe (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const STRIPE_KNOWN_TAP = {
  "name": "stripe",
  "url": "https://github.com/stripe/ai.git",
  "subpath": "skills",
  "description": "Stripe skills for payments best practices, project setup, and Stripe upgrades.",
  "trust": "official",
  "skills": [
    {
      "name": "stripe-best-practices",
      "namespace": null,
      "description": "Guides Stripe integration decisions — API selection (Checkout Sessions vs PaymentIntents), Connect platform setup (Accounts v2, controller properties), billing/subscriptions, Treasury financial accounts, integration surfaces (Checkout, Payment Element), migrating from deprecated Stripe APIs, and security best practices (API key management, restricted keys, webhooks, OAuth). Use when building, modifying, or reviewing any Stripe integration — including accepting payments, building marketplaces, integrating Stripe, processing payments, setting up subscriptions, creating connected accounts, or implementing secure key handling.",
      "path": "stripe-best-practices"
    },
    {
      "name": "stripe-projects",
      "namespace": null,
      "description": "Use when the user needs to provision a third-party service available on https://projects.dev/providers; create or retrieve a provider/service API, key or token; sign up for a service; or references projects.dev. Handles the full flow from checking provider availability through project initialization, then hands off to locally installed skills.",
      "path": "stripe-projects"
    },
    {
      "name": "upgrade-stripe",
      "namespace": null,
      "description": "Guide for upgrading Stripe API versions and SDKs",
      "path": "upgrade-stripe"
    }
  ]
} as const satisfies KnownTap;
