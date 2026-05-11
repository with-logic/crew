/**
 * Generated known-tap skill data for azure (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTapSkill } from "../types.ts";

export const AZURE_KNOWN_TAP_SKILLS_1 = [
  {
    "name": "airunway-aks-setup",
    "namespace": null,
    "description": "Set up AI Runway on AKS — from bare cluster to running model. Covers cluster verification, controller install, GPU assessment, provider setup, and first deployment. WHEN: \"setup AI Runway\", \"onboard AKS cluster\", \"install AI Runway\", \"airunway setup\", \"deploy model to AKS\", \"GPU inference on AKS\", \"KAITO setup on AKS\", \"run LLM on AKS\", \"vLLM on AKS\", \"set up model serving on AKS\", \"AI Runway controller\".",
    "path": "airunway-aks-setup"
  },
  {
    "name": "appinsights-instrumentation",
    "namespace": null,
    "description": "Guidance for instrumenting webapps with Azure Application Insights. Provides telemetry patterns, SDK setup, and configuration references. WHEN: how to instrument app, App Insights SDK, telemetry patterns, what is App Insights, Application Insights guidance, instrumentation examples, APM best practices.",
    "path": "appinsights-instrumentation"
  },
  {
    "name": "azure-ai",
    "namespace": null,
    "description": "Use for Azure AI: Search, Speech, OpenAI, Document Intelligence. Helps with search, vector/hybrid search, speech-to-text, text-to-speech, transcription, OCR. WHEN: AI Search, query search, vector search, hybrid search, semantic search, speech-to-text, text-to-speech, transcribe, OCR, convert text to speech.",
    "path": "azure-ai"
  },
  {
    "name": "azure-aigateway",
    "namespace": null,
    "description": "Configure Azure API Management as an AI Gateway for AI models, MCP tools, and agents. WHEN: semantic caching, token limit, content safety, load balancing, AI model governance, MCP rate limiting, jailbreak detection, add Azure OpenAI backend, add AI Foundry model, test AI gateway, LLM policies, configure AI backend, token metrics, AI cost control, convert API to MCP, import OpenAPI to gateway.",
    "path": "azure-aigateway"
  },
  {
    "name": "azure-cloud-migrate",
    "namespace": null,
    "description": "Assess and migrate cross-cloud workloads to Azure with reports and code conversion. Supports Lambda→Functions, Beanstalk/Heroku/App Engine→App Service, Fargate/Kubernetes/Cloud Run/Spring Boot→Container Apps. WHEN: migrate Lambda to Functions, AWS to Azure, migrate Beanstalk, migrate Heroku, migrate App Engine, Cloud Run migration, Fargate to ACA, ECS/Kubernetes/GKE/EKS to Container Apps, Spring Boot to Container Apps, cross-cloud migration.",
    "path": "azure-cloud-migrate"
  },
  {
    "name": "azure-compliance",
    "namespace": null,
    "description": "Run Azure compliance and security audits with azqr plus Key Vault expiration checks. Covers best-practice assessment, resource review, policy/compliance validation, and security posture checks. WHEN: compliance scan, security audit, BEFORE running azqr (compliance cli tool), Azure best practices, Key Vault expiration check, expired certificates, expiring secrets, orphaned resources, compliance assessment.",
    "path": "azure-compliance"
  },
  {
    "name": "azure-compute",
    "namespace": null,
    "description": "Azure VM and VMSS router for recommendations, pricing, autoscale, orchestration, connectivity troubleshooting, capacity reservations, and Essential Machine Management. WHEN: Azure VM, VMSS, scale set, recommend, compare, server, website, burstable, lightweight, VM family, workload, GPU, learning, simulation, dev/test, backend, autoscale, load balancer, Flexible orchestration, Uniform orchestration, cost estimate, connect, refused, Linux, black screen, reset password, reach VM, port 3389, NSG, troubleshoot, capacity reservation, CRG, reserve VMs, guarantee capacity, pre-provision capacity, CRG association, CRG disassociation, essential machine management, EMM, machine enrollment.",
    "path": "azure-compute"
  },
  {
    "name": "azure-cost",
    "namespace": null,
    "description": "Unified Azure cost management: query historical costs, forecast future spending, and optimize to reduce waste. WHEN: \"Azure costs\", \"Azure spending\", \"Azure bill\", \"cost breakdown\", \"cost by service\", \"cost by resource\", \"how much am I spending\", \"show my bill\", \"monthly cost summary\", \"cost trends\", \"top cost drivers\", \"actual cost\", \"amortized cost\", \"forecast spending\", \"projected costs\", \"estimate bill\", \"future costs\", \"budget forecast\", \"end of month costs\", \"how much will I spend\", \"optimize costs\", \"reduce spending\", \"find cost savings\", \"orphaned resources\", \"rightsize VMs\", \"cost analysis\", \"reduce waste\", \"unused resources\", \"optimize Redis costs\", \"cost by tag\", \"cost by resource group\", \"AKS cost analysis add-on\", \"namespace cost\", \"cost spike\", \"anomaly\", \"budget alert\", \"AKS cost visibility\". DO NOT USE FOR: deploying resources, provisioning infrastructure, diagnostics, security audits, or estimating costs for new resources not yet deployed.",
    "path": "azure-cost"
  },
  {
    "name": "azure-deploy",
    "namespace": null,
    "description": "Execute Azure deployments for ALREADY-PREPARED applications that have existing .azure/deployment-plan.md and infrastructure files. DO NOT use this skill when the user asks to CREATE a new application — use azure-prepare instead. This skill runs azd up, azd deploy, terraform apply, and az deployment commands with built-in error recovery. Requires .azure/deployment-plan.md from azure-prepare and validated status from azure-validate. WHEN: \"run azd up\", \"run azd deploy\", \"execute deployment\", \"push to production\", \"push to cloud\", \"go live\", \"ship it\", \"bicep deploy\", \"terraform apply\", \"publish to Azure\", \"launch on Azure\". DO NOT USE WHEN: \"create and deploy\", \"build and deploy\", \"create a new app\", \"set up infrastructure\", \"create and deploy to Azure using Terraform\" — use azure-prepare for these.",
    "path": "azure-deploy"
  },
  {
    "name": "azure-diagnostics",
    "namespace": null,
    "description": "Debug Azure production issues on Azure using AppLens, Azure Monitor, resource health, and safe triage. WHEN: debug production issues, troubleshoot app service, app service high CPU, app service deployment failure, troubleshoot container apps, troubleshoot functions, troubleshoot AKS, kubectl cannot connect, kube-system/CoreDNS failures, pod pending, crashloop, node not ready, upgrade failures, analyze logs, KQL, insights, image pull failures, cold start issues, health probe failures, resource health, root cause of errors, troubleshoot event hubs, troubleshoot service bus, messaging SDK error, AMQP connection failure, message lock lost, service bus dead letter.",
    "path": "azure-diagnostics"
  },
  {
    "name": "azure-enterprise-infra-planner",
    "namespace": null,
    "description": "Architect and provision enterprise Azure infrastructure from workload descriptions. For cloud architects and platform engineers planning networking, identity, security, compliance, and multi-resource topologies with WAF alignment. Generates Bicep or Terraform directly (no azd). WHEN: 'plan Azure infrastructure', 'architect Azure landing zone', 'design hub-spoke network', 'plan multi-region DR topology', 'set up VNets firewalls and private endpoints', 'subscription-scope Bicep deployment', 'Azure Backup for VM workloads'. PREFER azure-prepare FOR app-centric workflows.",
    "path": "azure-enterprise-infra-planner"
  },
  {
    "name": "azure-hosted-copilot-sdk",
    "namespace": null,
    "description": "Build, deploy, and modify GitHub Copilot SDK apps on Azure. MANDATORY when codebase contains @github/copilot-sdk or CopilotClient in package.json. PREFER OVER azure-prepare when copilot-sdk markers detected. WHEN: copilot SDK, @github/copilot-sdk, copilot-powered app, build copilot app, prepare copilot app, add feature to copilot app, modify copilot app, BYOM, bring your own model, CopilotClient, createSession, sendAndWait, azd init copilot. DO NOT USE FOR: deploying already-prepared copilot-sdk apps (use azure-deploy), general web apps without copilot SDK (use azure-prepare), Copilot Extensions, Foundry agents (use microsoft-foundry).",
    "path": "azure-hosted-copilot-sdk"
  },
  {
    "name": "azure-kubernetes",
    "namespace": null,
    "description": "Plan, create, and configure production-ready Azure Kubernetes Service (AKS) clusters. Covers Day-0 checklist, SKU selection (Automatic vs Standard), networking options (private API server, Azure CNI Overlay, egress configuration), security, and operations (autoscaling, upgrade strategy, cost analysis). WHEN: create AKS environment, provision AKS environment, enable AKS observability, design AKS networking, choose AKS SKU, secure AKS, optimize AKS, rightsize AKS pod, AKS spot nodes, AKS cluster-autoscaler.",
    "path": "azure-kubernetes"
  },
  {
    "name": "azure-kusto",
    "namespace": null,
    "description": "Query and analyze data in Azure Data Explorer (Kusto/ADX) using KQL for log analytics, telemetry, and time series analysis. WHEN: KQL queries, Kusto database queries, Azure Data Explorer, ADX clusters, log analytics, time series data, IoT telemetry, anomaly detection.",
    "path": "azure-kusto"
  },
  {
    "name": "azure-messaging",
    "namespace": null,
    "description": "Troubleshoot and resolve issues with Azure Messaging SDKs for Event Hubs and Service Bus. Covers connection failures, authentication errors, message processing issues, and SDK configuration problems. WHEN: event hub SDK error, service bus SDK issue, messaging connection failure, AMQP error, event processor host issue, message lock lost, message lock expired, lock renewal, lock renewal batch, send timeout, receiver disconnected, SDK troubleshooting, azure messaging SDK, event hub consumer, service bus queue issue, topic subscription error, enable logging event hub, service bus logging, eventhub python, servicebus java, eventhub javascript, servicebus dotnet, event hub checkpoint, event hub not receiving messages, service bus dead letter, batch processing lock, session lock expired, idle timeout, connection inactive, link detach, slow reconnect, session error, duplicate events, offset reset, receive batch.",
    "path": "azure-messaging"
  },
  {
    "name": "azure-prepare",
    "namespace": null,
    "description": "Prepare Azure apps for deployment (infra Bicep/Terraform, azure.yaml, Dockerfiles). Use for create/modernize or create+deploy; not cross-cloud migration (use azure-cloud-migrate). DO NOT USE FOR: copilot-sdk apps (use azure-hosted-copilot-sdk). WHEN: \"create app\", \"build web app\", \"create API\", \"create serverless HTTP API\", \"create frontend\", \"create back end\", \"build a service\", \"modernize application\", \"update application\", \"add authentication\", \"add caching\", \"host on Azure\", \"create and deploy\", \"deploy to Azure\", \"deploy to Azure using Terraform\", \"deploy to Azure App Service\", \"deploy to Azure App Service using Terraform\", \"deploy to Azure Container Apps\", \"deploy to Azure Container Apps using Terraform\", \"generate Terraform\", \"generate Bicep\", \"function app\", \"timer trigger\", \"service bus trigger\", \"event-driven function\", \"containerized Node.js app\", \"social media app\", \"static portfolio website\", \"todo list with frontend and API\", \"prepare my Azure application to use Key Vault\", \"managed identity\".",
    "path": "azure-prepare"
  },
  {
    "name": "azure-quotas",
    "namespace": null,
    "description": "Check/manage Azure quotas and usage across providers. For deployment planning, capacity validation, region selection. WHEN: \"check quotas\", \"service limits\", \"current usage\", \"request quota increase\", \"quota exceeded\", \"validate capacity\", \"regional availability\", \"provisioning limits\", \"vCPU limit\", \"how many vCPUs available in my subscription\".",
    "path": "azure-quotas"
  },
  {
    "name": "azure-rbac",
    "namespace": null,
    "description": "Helps users find the right Azure RBAC role for an identity with least privilege access, then generate CLI commands and Bicep code to assign it. Also provides guidance on permissions required to grant roles. WHEN: bicep for role assignment, what role should I assign, least privilege role, RBAC role for, role to read blobs, role for managed identity, custom role definition, assign role to identity, what role do I need to grant access, permissions to assign roles.",
    "path": "azure-rbac"
  },
  {
    "name": "azure-resource-lookup",
    "namespace": null,
    "description": "List, find, and show Azure resources across subscriptions or resource groups. Handles prompts like \"list the websites in my subscription\", \"list my web apps\", \"show my app services\", \"list virtual machines\", \"list my VMs\", \"show storage accounts\", \"find container apps\", and \"what resources do I have\". USE FOR: list websites, list web apps, list app services, show websites in subscription, resource inventory, find resources by tag, tag analysis, orphaned resource discovery (not for cost analysis), unattached disks, count resources by type, cross-subscription lookup, and Azure Resource Graph queries. DO NOT USE FOR: deploying/changing resources (use azure-deploy), cost optimization (use azure-cost), or non-Azure clouds.",
    "path": "azure-resource-lookup"
  },
  {
    "name": "azure-resource-visualizer",
    "namespace": null,
    "description": "Analyze Azure resource groups and generate detailed Mermaid architecture diagrams showing the relationships between individual resources. WHEN: create architecture diagram, visualize Azure resources, show resource relationships, generate Mermaid diagram, analyze resource group, diagram my resources, architecture visualization, resource topology, map Azure infrastructure.",
    "path": "azure-resource-visualizer"
  },
  {
    "name": "azure-storage",
    "namespace": null,
    "description": "Azure Storage Services including Blob Storage, File Shares, Queue Storage, Table Storage, and Data Lake. Answers questions about storage access tiers (hot, cool, cold, archive), when to use each tier, and tier comparison. Provides object storage, SMB file shares, async messaging, NoSQL key-value, and big data analytics. Includes lifecycle management. USE FOR: blob storage, file shares, queue storage, table storage, data lake, upload files, download blobs, storage accounts, access tiers, storage tiers, hot cool cold archive, storage tier comparison, when to use storage tiers, lifecycle management, Azure Storage concepts. DO NOT USE FOR: SQL databases, Cosmos DB (use azure-prepare), messaging with Event Hubs or Service Bus (use azure-messaging).",
    "path": "azure-storage"
  },
  {
    "name": "azure-upgrade",
    "namespace": null,
    "description": "Assess and upgrade Azure workloads between plans, tiers, or SKUs, or modernize Azure SDK dependencies in source code. WHEN: upgrade Consumption to Flex Consumption, upgrade Azure Functions plan, change hosting plan, function app SKU, migrate App Service to Container Apps, modernize legacy Azure Java SDKs (com.microsoft.azure to com.azure), migrate Azure Cache for Redis (ACR/ACRE) to Azure Managed Redis (AMR).",
    "path": "azure-upgrade"
  },
  {
    "name": "azure-validate",
    "namespace": null,
    "description": "Pre-deployment validation for Azure readiness. Run deep checks on configuration, infrastructure (Bicep or Terraform), RBAC role assignments, managed identity permissions, and prerequisites before deploying. WHEN: validate my app, check deployment readiness, run preflight checks, verify configuration, check if ready to deploy, validate azure.yaml, validate Bicep, test before deploying, troubleshoot deployment errors, validate Azure Functions, validate function app, validate serverless deployment, verify RBAC roles, check role assignments, review managed identity permissions, what-if analysis, validate Container Apps deployment.",
    "path": "azure-validate"
  },
  {
    "name": "entra-agent-id",
    "namespace": null,
    "description": "Provision Microsoft Entra Agent Identity Blueprints, BlueprintPrincipals, and per-instance Agent Identities via Microsoft Graph, and configure OAuth 2.0 token exchange (fmi_path, OBO, cross-tenant) including the Microsoft Entra SDK for AgentID sidecar. USE FOR: Agent Identity Blueprint, BlueprintPrincipal, agent OAuth, fmi_path token exchange, agent OBO, Workload Identity Federation for agents, polyglot agent auth, Microsoft.Identity.Web.AgentIdentities. DO NOT USE FOR: standard Entra app registration (use entra-app-registration), Azure RBAC (use azure-rbac), Microsoft Foundry agent authoring (use microsoft-foundry).",
    "path": "entra-agent-id"
  }
] as const satisfies readonly KnownTapSkill[];
