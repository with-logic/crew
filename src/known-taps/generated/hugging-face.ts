/**
 * Generated known-tap registry data for hugging-face (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const HUGGING_FACE_KNOWN_TAP = {
  "name": "hugging-face",
  "url": "https://github.com/huggingface/skills.git",
  "subpath": "skills",
  "description": "Hugging Face skills for models, datasets, Gradio, local models, papers, evaluation, training, and tooling.",
  "trust": "official",
  "skills": [
    {
      "name": "hf-cli",
      "namespace": null,
      "description": "Hugging Face Hub CLI (`hf`) for downloading, uploading, and managing models, datasets, spaces, buckets, repos, papers, jobs, and more on the Hugging Face Hub. Use when: handling authentication; managing local cache; managing Hugging Face Buckets; running or scheduling jobs on Hugging Face infrastructure; managing Hugging Face repos; discussions and pull requests; browsing models, datasets and spaces; reading, searching, or browsing academic papers; managing collections; querying datasets; configuring spaces; setting up webhooks; or deploying and managing HF Inference Endpoints. Make sure to use this skill whenever the user mentions 'hf', 'huggingface', 'Hugging Face', 'huggingface-cli', or 'hugging face cli', or wants to do anything related to the Hugging Face ecosystem and to AI and ML in general. Also use for cloud storage needs like training checkpoints, data pipelines, or agent traces. Use even if the user doesn't explicitly ask for a CLI command. Replaces the deprecated `huggingface-cli`.",
      "path": "hf-cli"
    },
    {
      "name": "huggingface-best",
      "namespace": null,
      "description": "Use when the user asks about finding the best, top, or recommended model for a task, wants to know what AI model to use, or wants to compare models by benchmark scores. Triggers on: \"best model for X\", \"what model should I use for\", \"top models for [task]\", \"which model runs on my laptop/machine/device\", \"recommend a model for\", \"what LLM should I use for\", \"compare models for\", \"what's state of the art for\", or any question about choosing an AI model for a specific use case. Always use this skill when the user wants model recommendations or comparisons, even if they don't explicitly mention HuggingFace or benchmarks.\n",
      "path": "huggingface-best"
    },
    {
      "name": "huggingface-community-evals",
      "namespace": null,
      "description": "Run evaluations for Hugging Face Hub models using inspect-ai and lighteval on local hardware. Use for backend selection, local GPU evals, and choosing between vLLM / Transformers / accelerate. Not for HF Jobs orchestration, model-card PRs, .eval_results publication, or community-evals automation.",
      "path": "huggingface-community-evals"
    },
    {
      "name": "huggingface-datasets",
      "namespace": null,
      "description": "Use this skill for Hugging Face Dataset Viewer API workflows that fetch subset/split metadata, paginate rows, search text, apply filters, download parquet URLs, and read size or statistics.",
      "path": "huggingface-datasets"
    },
    {
      "name": "huggingface-gradio",
      "namespace": null,
      "description": "Build Gradio web UIs and demos in Python. Use when creating or editing Gradio apps, components, event listeners, layouts, or chatbots.",
      "path": "huggingface-gradio"
    },
    {
      "name": "huggingface-llm-trainer",
      "namespace": null,
      "description": "Train or fine-tune language and vision models using TRL (Transformer Reinforcement Learning) or Unsloth with Hugging Face Jobs infrastructure. Covers SFT, DPO, GRPO and reward modeling training methods, plus GGUF conversion for local deployment. Includes guidance on the TRL Jobs package, UV scripts with PEP 723 format, dataset preparation and validation, hardware selection, cost estimation, Trackio monitoring, Hub authentication, model selection/leaderboards and model persistence. Use for tasks involving cloud GPU training, GGUF conversion, or when users mention training on Hugging Face Jobs without local GPU setup.",
      "path": "huggingface-llm-trainer"
    },
    {
      "name": "huggingface-local-models",
      "namespace": null,
      "description": "Use to select models to run locally with llama.cpp and GGUF on CPU, Mac Metal, CUDA, or ROCm. Covers finding GGUFs, quant selection, running servers, exact GGUF file lookup, conversion, and OpenAI-compatible local serving.",
      "path": "huggingface-local-models"
    },
    {
      "name": "huggingface-paper-publisher",
      "namespace": null,
      "description": "Publish and manage research papers on Hugging Face Hub. Supports creating paper pages, linking papers to models/datasets, claiming authorship, and generating professional markdown-based research articles.",
      "path": "huggingface-paper-publisher"
    },
    {
      "name": "huggingface-papers",
      "namespace": null,
      "description": "Look up and read Hugging Face paper pages in markdown, and use the papers API for structured metadata such as authors, linked models/datasets/spaces, Github repo and project page. Use when the user shares a Hugging Face paper page URL, an arXiv URL or ID, or asks to summarize, explain, or analyze an AI research paper.",
      "path": "huggingface-papers"
    },
    {
      "name": "huggingface-tool-builder",
      "namespace": null,
      "description": "Use this skill when the user wants to build tool/scripts or achieve a task where using data from the Hugging Face API would help. This is especially useful when chaining or combining API calls or the task will be repeated/automated. This Skill creates a reusable script to fetch, enrich or process data.",
      "path": "huggingface-tool-builder"
    },
    {
      "name": "huggingface-trackio",
      "namespace": null,
      "description": "Track and visualize ML training experiments with Trackio. Use when logging metrics during training (Python API), firing alerts for training diagnostics, or retrieving/analyzing logged metrics (CLI). Supports real-time dashboard visualization, alerts with webhooks, HF Space syncing, and JSON output for automation.",
      "path": "huggingface-trackio"
    },
    {
      "name": "huggingface-vision-trainer",
      "namespace": null,
      "description": "Trains and fine-tunes vision models for object detection (D-FINE, RT-DETR v2, DETR, YOLOS), image classification (timm models — MobileNetV3, MobileViT, ResNet, ViT/DINOv3 — plus any Transformers classifier), and SAM/SAM2 segmentation using Hugging Face Transformers on Hugging Face Jobs cloud GPUs. Covers COCO-format dataset preparation, Albumentations augmentation, mAP/mAR evaluation, accuracy metrics, SAM segmentation with bbox/point prompts, DiceCE loss, hardware selection, cost estimation, Trackio monitoring, and Hub persistence. Use when users mention training object detection, image classification, SAM, SAM2, segmentation, image matting, DETR, D-FINE, RT-DETR, ViT, timm, MobileNet, ResNet, bounding box models, or fine-tuning vision models on Hugging Face Jobs.",
      "path": "huggingface-vision-trainer"
    },
    {
      "name": "train-sentence-transformers",
      "namespace": null,
      "description": "Train or fine-tune sentence-transformers models across `SentenceTransformer` (bi-encoder; dense or static embedding model; for retrieval, similarity, clustering, classification, paraphrase mining, dedup, multimodal), `CrossEncoder` (reranker; pair scoring for two-stage retrieval / pair classification), and `SparseEncoder` (SPLADE, sparse embedding model; for learned-sparse retrieval). Covers loss selection, hard-negative mining, evaluators, distillation, LoRA, Matryoshka, and Hugging Face Hub publishing. Use for any sentence-transformers training task.",
      "path": "train-sentence-transformers"
    },
    {
      "name": "transformers-js",
      "namespace": null,
      "description": "Use Transformers.js to run state-of-the-art machine learning models directly in JavaScript/TypeScript. Supports NLP (text classification, translation, summarization), computer vision (image classification, object detection), audio (speech recognition, audio classification), and multimodal tasks. Works in browsers and server-side runtimes (Node.js, Bun, Deno) with WebGPU/WASM using pre-trained models from Hugging Face Hub.",
      "path": "transformers-js"
    }
  ]
} as const satisfies KnownTap;
