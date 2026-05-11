/**
 * Generated known-tap registry data for anthropic-life-sciences (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_LIFE_SCIENCES_KNOWN_TAP = {
  "name": "anthropic-life-sciences",
  "url": "https://github.com/anthropics/life-sciences.git",
  "subpath": "",
  "description": "Anthropic life-sciences skills for clinical protocols, lab data, bioinformatics, Nextflow, and single-cell workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "clinical-trial-protocol-skill",
      "namespace": null,
      "description": "Generate clinical trial protocols for medical devices or drugs. This skill should be used when users say \"Create a clinical trial protocol\", \"Generate protocol for [device/drug]\", \"Help me design a clinical study\", \"Research similar trials for [intervention]\", or when developing FDA submission documentation for investigational products.",
      "path": "clinical-trial-protocol-skill"
    },
    {
      "name": "instrument-data-to-allotrope",
      "namespace": null,
      "description": "Convert laboratory instrument output files (PDF, CSV, Excel, TXT) to Allotrope Simple Model (ASM) JSON format or flattened 2D CSV. Use this skill when scientists need to standardize instrument data for LIMS systems, data lakes, or downstream analysis. Supports auto-detection of instrument types. Outputs include full ASM JSON, flattened CSV for easy import, and exportable Python code for data engineers. Common triggers include converting instrument files, standardizing lab data, preparing data for upload to LIMS/ELN systems, or generating parser code for production pipelines.",
      "path": "instrument-data-to-allotrope"
    },
    {
      "name": "nextflow-development",
      "namespace": null,
      "description": "Run nf-core bioinformatics pipelines (rnaseq, sarek, atacseq) on sequencing data. Use when analyzing RNA-seq, WGS/WES, or ATAC-seq data—either local FASTQs or public datasets from GEO/SRA. Triggers on nf-core, Nextflow, FASTQ analysis, variant calling, gene expression, differential expression, GEO reanalysis, GSE/GSM/SRR accessions, or samplesheet creation.",
      "path": "nextflow-development"
    },
    {
      "name": "scientific-problem-selection",
      "namespace": null,
      "description": "This skill should be used when scientists need help with research problem selection, project ideation, troubleshooting stuck projects, or strategic scientific decisions. Use this skill when users ask to pitch a new research idea, work through a project problem, evaluate project risks, plan research strategy, navigate decision trees, or get help choosing what scientific problem to work on. Typical requests include \"I have an idea for a project\", \"I'm stuck on my research\", \"help me evaluate this project\", \"what should I work on\", or \"I need strategic advice about my research\".",
      "path": "scientific-problem-selection"
    },
    {
      "name": "scvi-tools",
      "namespace": null,
      "description": "Deep learning for single-cell analysis using scvi-tools. This skill should be used when users need (1) data integration and batch correction with scVI/scANVI, (2) ATAC-seq analysis with PeakVI, (3) CITE-seq multi-modal analysis with totalVI, (4) multiome RNA+ATAC analysis with MultiVI, (5) spatial transcriptomics deconvolution with DestVI, (6) label transfer and reference mapping with scANVI/scArches, (7) RNA velocity with veloVI, or (8) any deep learning-based single-cell method. Triggers include mentions of scVI, scANVI, totalVI, PeakVI, MultiVI, DestVI, veloVI, sysVI, scArches, variational autoencoder, VAE, batch correction, data integration, multi-modal, CITE-seq, multiome, reference mapping, latent space.",
      "path": "scvi-tools"
    },
    {
      "name": "single-cell-rna-qc",
      "namespace": null,
      "description": "Performs quality control on single-cell RNA-seq data (.h5ad or .h5 files) using scverse best practices with MAD-based filtering and comprehensive visualizations. Use when users request QC analysis, filtering low-quality cells, assessing data quality, or following scverse/scanpy best practices for single-cell analysis.",
      "path": "single-cell-rna-qc"
    }
  ]
} as const satisfies KnownTap;
