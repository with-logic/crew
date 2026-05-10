/**
 * Generated known-tap registry data for apollo (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const APOLLO_KNOWN_TAP = {
  "name": "apollo",
  "url": "https://github.com/apollographql/skills.git",
  "subpath": "skills",
  "description": "Apollo GraphQL skills for clients, schemas, operations, federation, Router, Server, Rover, and MCP workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "apollo-client",
      "namespace": null,
      "description": "Guide for building React applications with Apollo Client 4.x. Use this skill when: (1) setting up Apollo Client in a React project, (2) writing GraphQL queries or mutations with hooks, (3) configuring caching or cache policies, (4) managing local state with reactive variables, (5) troubleshooting Apollo Client errors or performance issues.\n",
      "path": "apollo-client"
    },
    {
      "name": "apollo-connectors",
      "namespace": null,
      "description": "Guide for integrating REST APIs into GraphQL supergraphs using Apollo Connectors with @source and @connect directives. Use this skill when the user: (1) mentions \"connectors\", \"Apollo Connectors\", or \"REST Connector\", (2) wants to integrate a REST API into GraphQL, (3) references @source or @connect directives, (4) works with files containing \"# Note to AI Friends: This is an Apollo Connectors schema\".\n",
      "path": "apollo-connectors"
    },
    {
      "name": "apollo-federation",
      "namespace": null,
      "description": "Guide for authoring Apollo Federation subgraph schemas. Use this skill when: (1) creating new subgraph schemas for a federated supergraph, (2) defining or modifying entities with @key, (3) sharing types/fields across subgraphs with @shareable, (4) working with federation directives (@external, @requires, @provides, @override, @inaccessible), (5) troubleshooting composition errors, (6) any task involving federation schema design patterns.\n",
      "path": "apollo-federation"
    },
    {
      "name": "apollo-ios",
      "namespace": null,
      "description": "Guide for building Apple-platform applications with Apollo iOS, the strongly-typed GraphQL client for Swift. Use this skill when: (1) adding Apollo iOS to a Swift Package Manager or Xcode project, (2) configuring `apollo-codegen-config.json` and running code generation, (3) configuring an `ApolloClient` with auth, interceptors, and caching, (4) writing queries, mutations, or subscriptions from SwiftUI views, (5) writing tests against generated operation mocks.\n",
      "path": "apollo-ios"
    },
    {
      "name": "apollo-kotlin",
      "namespace": null,
      "description": "Guide for building applications with Apollo Kotlin, the GraphQL client library for Android and Kotlin. Use this skill when: (1) setting up Apollo Kotlin in a Gradle project for Android, Kotlin/JVM, or KMP, (2) configuring schema download and codegen for GraphQL services, (3) configuring an `ApolloClient` with auth, interceptors, and caching, (4) writing queries, mutations, or subscriptions,\n",
      "path": "apollo-kotlin"
    },
    {
      "name": "apollo-mcp-server",
      "namespace": null,
      "description": "Guide for using Apollo MCP Server to connect AI agents with GraphQL APIs. Use this skill when: (1) setting up or configuring Apollo MCP Server, (2) defining MCP tools from GraphQL operations, (3) using introspection tools (introspect, search, validate, execute), (4) troubleshooting MCP server connectivity or tool execution issues.\n",
      "path": "apollo-mcp-server"
    },
    {
      "name": "apollo-router",
      "namespace": null,
      "description": "Version-aware guide for configuring and running Apollo Router for federated GraphQL supergraphs. Generates correct YAML for both Router v1.x and v2.x. Use this skill when: (1) setting up Apollo Router to run a supergraph, (2) configuring routing, headers, or CORS, (3) implementing custom plugins (Rhai scripts or coprocessors), (4) configuring telemetry (tracing, metrics, logging), (5) troubleshooting Router performance or connectivity issues.\n",
      "path": "apollo-router"
    },
    {
      "name": "apollo-router-plugin-creator",
      "namespace": null,
      "description": "Guide for writing Apollo Router native Rust plugins. Use this skill when: (1) users want to create a new router plugin, (2) users want to add service hooks (router_service, supergraph_service, execution_service, subgraph_service), (3) users want to modify an existing router plugin, (4) users need to understand router plugin patterns or the request lifecycle. (5) triggers on requests like \"create a new plugin\", \"add a router plugin\", \"modify the X plugin\", or \"add subgraph_service hook\".\n",
      "path": "apollo-router-plugin-creator"
    },
    {
      "name": "apollo-server",
      "namespace": null,
      "description": "Guide for building GraphQL servers with Apollo Server 5.x. Use this skill when: (1) setting up a new Apollo Server project, (2) writing resolvers or defining GraphQL schemas, (3) implementing authentication or authorization, (4) creating plugins or custom data sources, (5) troubleshooting Apollo Server errors or performance issues.\n",
      "path": "apollo-server"
    },
    {
      "name": "graphql-operations",
      "namespace": null,
      "description": "Guide for writing GraphQL operations (queries, mutations, fragments) following best practices. Use this skill when: (1) writing GraphQL queries or mutations, (2) organizing operations with fragments, (3) optimizing data fetching patterns, (4) setting up type generation or linting, (5) reviewing operations for efficiency.\n",
      "path": "graphql-operations"
    },
    {
      "name": "graphql-schema",
      "namespace": null,
      "description": "Guide for designing GraphQL schemas following industry best practices. Use this skill when: (1) designing a new GraphQL schema or API, (2) reviewing existing schema for improvements, (3) deciding on type structures or nullability, (4) implementing pagination or error patterns, (5) ensuring security in schema design.\n",
      "path": "graphql-schema"
    },
    {
      "name": "rover",
      "namespace": null,
      "description": "Guide for using Apollo Rover CLI to manage GraphQL schemas and federation. Use this skill when: (1) publishing or fetching subgraph/graph schemas, (2) composing supergraph schemas locally or via GraphOS, (3) running local supergraph development with rover dev, (4) validating schemas with check and lint commands, (5) configuring Rover authentication and environment.\n",
      "path": "rover"
    },
    {
      "name": "rust-best-practices",
      "namespace": null,
      "description": "Guide for writing idiomatic Rust code based on Apollo GraphQL's best practices handbook. Use this skill when: (1) writing new Rust code or functions, (2) reviewing or refactoring existing Rust code, (3) deciding between borrowing vs cloning or ownership patterns, (4) implementing error handling with Result types, (5) optimizing Rust code for performance, (6) writing tests or documentation for Rust projects.\n",
      "path": "rust-best-practices"
    },
    {
      "name": "skill-creator",
      "namespace": null,
      "description": "Guide for creating effective skills for Apollo GraphQL and GraphQL development. Use this skill when: (1) users want to create a new skill, (2) users want to update an existing skill, (3) users ask about skill structure or best practices, (4) users need help writing SKILL.md files.\n",
      "path": "skill-creator"
    }
  ]
} as const satisfies KnownTap;
