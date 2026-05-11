/**
 * Generated known-tap registry data for anthropic-data (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_DATA_KNOWN_TAP = {
  "name": "anthropic-data",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "data",
  "description": "Anthropic knowledge-work skills for data analysis, dashboards, SQL, visualization, and statistical workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "analyze",
      "namespace": null,
      "description": "Answer data questions -- from quick lookups to full analyses. Use when looking up a single metric, investigating what's driving a trend or drop, comparing segments over time, or preparing a formal data report for stakeholders.",
      "path": "skills/analyze"
    },
    {
      "name": "build-dashboard",
      "namespace": null,
      "description": "Build an interactive HTML dashboard with charts, filters, and tables. Use when creating an executive overview with KPI cards, turning query results into a shareable self-contained report, building a team monitoring snapshot, or needing multiple charts with filters in one browser-openable file.",
      "path": "skills/build-dashboard"
    },
    {
      "name": "create-viz",
      "namespace": null,
      "description": "Create publication-quality visualizations with Python. Use when turning query results or a DataFrame into a chart, selecting the right chart type for a trend or comparison, generating a plot for a report or presentation, or needing an interactive chart with hover and zoom.",
      "path": "skills/create-viz"
    },
    {
      "name": "data-context-extractor",
      "namespace": null,
      "description": "Generate or improve a company-specific data analysis skill by extracting tribal knowledge from analysts.\nBOOTSTRAP MODE - Triggers: \"Create a data context skill\", \"Set up data analysis for our warehouse\", \"Help me create a skill for our database\", \"Generate a data skill for [company]\" → Discovers schemas, asks key questions, generates initial skill with reference files\nITERATION MODE - Triggers: \"Add context about [domain]\", \"The skill needs more info about [topic]\", \"Update the data skill with [metrics/tables/terminology]\", \"Improve the [domain] reference\" → Loads existing skill, asks targeted questions, appends/updates reference files\nUse when data analysts want Claude to understand their company's specific data warehouse, terminology, metrics definitions, and common query patterns.\n",
      "path": "skills/data-context-extractor"
    },
    {
      "name": "data-visualization",
      "namespace": null,
      "description": "Create effective data visualizations with Python (matplotlib, seaborn, plotly). Use when building charts, choosing the right chart type for a dataset, creating publication-quality figures, or applying design principles like accessibility and color theory.",
      "path": "skills/data-visualization"
    },
    {
      "name": "explore-data",
      "namespace": null,
      "description": "Profile and explore a dataset to understand its shape, quality, and patterns. Use when encountering a new table or file, checking null rates and column distributions, spotting data quality issues like duplicates or suspicious values, or deciding which dimensions and metrics to analyze.",
      "path": "skills/explore-data"
    },
    {
      "name": "sql-queries",
      "namespace": null,
      "description": "Write correct, performant SQL across all major data warehouse dialects (Snowflake, BigQuery, Databricks, PostgreSQL, etc.). Use when writing queries, optimizing slow SQL, translating between dialects, or building complex analytical queries with CTEs, window functions, or aggregations.",
      "path": "skills/sql-queries"
    },
    {
      "name": "statistical-analysis",
      "namespace": null,
      "description": "Apply statistical methods including descriptive stats, trend analysis, outlier detection, and hypothesis testing. Use when analyzing distributions, testing for significance, detecting anomalies, computing correlations, or interpreting statistical results.",
      "path": "skills/statistical-analysis"
    },
    {
      "name": "validate-data",
      "namespace": null,
      "description": "QA an analysis before sharing -- methodology, accuracy, and bias checks. Use when reviewing an analysis before a stakeholder presentation, spot-checking calculations and aggregation logic, verifying a SQL query's results look right, or assessing whether conclusions are actually supported by the data.",
      "path": "skills/validate-data"
    },
    {
      "name": "write-query",
      "namespace": null,
      "description": "Write optimized SQL for your dialect with best practices. Use when translating a natural-language data need into SQL, building a multi-CTE query with joins and aggregations, optimizing a query against a large partitioned table, or getting dialect-specific syntax for Snowflake, BigQuery, Postgres, etc.",
      "path": "skills/write-query"
    }
  ]
} as const satisfies KnownTap;
