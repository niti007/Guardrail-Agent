# Guardrail Agent

An AI-powered compliance scanning engine that analyses GitHub repository files against real-world regulatory frameworks — GDPR, SOC 2, HIPAA, ISO 27001, PCI-DSS, and NIST CSF — and produces structured audit evidence with policy decisions in seconds.

**Live:** https://v0-guardrail-ai-dashboard.vercel.app

---

## What it does

Guardrail Agent takes a GitHub repository and file path, fetches the file content via the GitHub API, enriches an LLM analysis with live compliance documentation scraped from authoritative sources, and returns a structured report containing:

- A pass/fail decision for each active policy rule
- Confidence scores and LLM-generated audit reasoning for every finding
- A complete, timestamped audit event trail suitable for export
- Support for approved policy exceptions that override violations

The entire pipeline runs in under 2 seconds on production.

---

## How it works

```
User submits repo + file path
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1 — GitHub File Fetch                                 │
│  Octokit fetches the raw file content from the repository.  │
│  Supports public and private repos via GITHUB_TOKEN.        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2 — Compliance Knowledge Base  (Bright Data)          │
│  Loads up to 13 compliance documents from a persistent      │
│  /tmp cache (TTL: 24 h). On cache miss, Bright Data scrapes │
│  live documentation from AICPA, NIST, GDPR.eu, and others. │
│  Falls back to direct fetch when Bright Data is unavailable.│
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3 — Mubit Exception Check                             │
│  Queries the Mubit audit API for any approved policy        │
│  exceptions on this file path before analysis begins.       │
│  Exceptions cause violations to be acknowledged but not     │
│  enforced, with a full audit trail preserved.               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4 — Parallel LLM Analysis  (Vercel AI Gateway)        │
│  All 5 policy rules are analysed concurrently using         │
│  google/gemini-3-flash via the Vercel AI Gateway.           │
│  Each call receives:                                        │
│    • The policy rule + framework requirement                │
│    • A 1,200-char excerpt of live compliance documentation  │
│    • The first 3,000 chars of the file content              │
│  The model returns structured JSON: violated, confidence,   │
│  reasoning, and resourceContext.                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5 — Policy Decision + Audit Trail                     │
│  Each finding is recorded as an audit event with action:    │
│    "Policy Enforced"    — active violation, no exception    │
│    "Exception Approved" — violation exists but is waived    │
│    "No Action"          — rule passed                       │
│  Outcome is COMPLIANT, VIOLATION, or EXCEPTION.             │
│  All events are persisted to the Mubit audit log.           │
└─────────────────────────────────────────────────────────────┘
```

---

## Policy rules

| Rule code    | Framework     | Description                         | Severity |
| ------------ | ------------- | ----------------------------------- | -------- |
| `GDPR-32.1`  | GDPR Art. 32  | Encryption at Rest Not Enforced     | critical |
| `GDPR-32.2`  | GDPR Art. 32  | Public Storage Bucket Detected      | critical |
| `SOC2-A1.2`  | SOC 2 Type II | Log Retention Exceeds Policy Window | medium   |
| `SOC2-CC6.3` | SOC 2 Type II | Overprivileged IAM Role Detected    | high     |
| `SOC2-CC6.7` | SOC 2 Type II | Network Segmentation Compliant      | high     |

---

## Compliance knowledge base

Guardrail scrapes 13 authoritative documents across 6 frameworks and stores them in a 24-hour rolling cache. On a warm cache a full scan uses ~200,000 characters of real regulatory text to ground every LLM decision.

| Framework | Sources |
| --------- | ------- |
| SOC 2 | AICPA Trust Services Criteria, SOC Reporting Overview |
| GDPR | GDPR.eu full text, Art. 32 Security of Processing, Art. 5 Principles |
| HIPAA | HHS Security Rule, HHS Privacy Rule |
| ISO 27001 | ISO 27001 overview, ISO 27002 controls |
| PCI-DSS | PCI DSS v4.0 overview, Requirements summary |
| NIST CSF | NIST CSF 2.0, NIST SP 800-53 controls |

---

## API

### `POST /api/scan`

Runs a compliance scan against a single file in any GitHub repository.

**Request body**

```json
{
  "owner": "your-org",
  "repo":  "your-repo",
  "path":  "infra/storage.tf"
}
```

**Response** (`ScanResult`)

```json
{
  "scanId": "uuid",
  "scannedAt": "2025-05-02T12:00:00.000Z",
  "target": { "owner": "...", "repo": "...", "path": "..." },
  "outcome": "VIOLATION",
  "hasPriorException": false,
  "complianceScrape": {
    "charCount": 200878,
    "cached": true
  },
  "logs": [
    { "level": "info",    "message": "Fetching file from GitHub..." },
    { "level": "success", "message": "File fetched — 142 lines" },
    { "level": "error",   "message": "Rule GDPR-32.2 VIOLATED ..." }
  ],
  "violations": [
    {
      "ruleCode":        "GDPR-32.2",
      "framework":       "GDPR Art. 32",
      "severity":        "critical",
      "confidence":      0.97,
      "reasoning":       "The S3 bucket ACL is set to public-read ...",
      "resourceContext": "aws_s3_bucket.uploads"
    }
  ],
  "auditEvents": [
    {
      "eventId":   "EVT-0001",
      "timestamp": "2025-05-02T12:00:01.234Z",
      "ruleCode":  "GDPR-32.2",
      "action":    "Policy Enforced",
      "severity":  "critical",
      "reasoning": "..."
    }
  ]
}
```

### `GET /api/compliance-docs`

Returns the current compliance knowledge base status. Add `?refresh=true` to force a fresh scrape from all 13 sources.

---

## Tech stack

| Layer | Technology |
| ----- | ---------- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| LLM | `google/gemini-3-flash` via Vercel AI Gateway (AI SDK 6) |
| GitHub integration | Octokit REST |
| Web scraping | Bright Data Scraping Browser API (direct-fetch fallback) |
| Audit trail | Mubit SDK — decision log + exception management |
| UI components | shadcn/ui + Radix UI + Tailwind CSS v4 |
| Charts | Recharts |
| Deployment | Vercel |

---

## Environment variables

| Variable | Description |
| -------- | ----------- |
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope (classic token) |
| `GOOGLE_API_KEY` | Google AI Studio key (fallback; primary LLM uses AI Gateway) |
| `BRIGHT_DATA_API_KEY` | Bright Data API key for the Scraping Browser endpoint |

The Vercel AI Gateway is zero-config — no additional API key is needed when deploying to Vercel.

---


## Project structure

```
app/
  api/
    scan/route.ts              # Core pipeline — fetch, scrape, LLM, audit
    compliance-docs/route.ts   # Bright Data scraper + /tmp KB cache
  page.tsx                     # Dashboard entry point
  layout.tsx

components/
  dashboard/
    system-header.tsx          # Repo + file input, scan trigger
    live-action-log.tsx        # Real-time pipeline log stream
    policy-decision-panel.tsx  # Violation cards with confidence + reasoning
    audit-evidence-table.tsx   # Audit event table with CSV export
    compliance-docs-panel.tsx  # Knowledge base status + source browser

lib/
  compliance-sources.ts        # 13 authoritative compliance source definitions
  scan-types.ts                # Shared TypeScript types for the scan pipeline

hooks/
  use-scan.ts                  # Client-side scan state management
```

---

## Roadmap — Phase 2

The following capabilities are planned for the next iteration. Placeholder module stubs are already present in `lib/agents/` to guide integration.

---

### 1. Vendor & Third-Party Risk Management (TPRM)

**What it does:** Extends Guardrail beyond your own code to audit every SaaS tool in your supply chain. When a new vendor is added, the agent autonomously scrapes that vendor's public Trust Center or Security page to verify they hold their own SOC 2 or ISO 27001 certification.

**The Mubit edge:** Every vendor check is stored in Mubit's persistent memory. If the same vendor is evaluated again months later, the agent instantly surfaces its historical security score: *"This vendor was flagged in our March review — poor encryption-at-rest posture."*

**Planned integrations:** Bright Data (Trust Center scraping) · Mubit (vendor risk memory) · Vercel AI Gateway (certification verification LLM)

**Placeholder:** `lib/agents/tprm-agent.ts`

---

### 2. Automated Offboarding Security

**What it does:** Eliminates "ghost access" — the biggest hidden compliance risk. Former employees and contractors who retain access to GitHub, Notion, cloud environments, or SaaS tools after leaving create audit failures and breach vectors. The agent monitors HR systems and communication channels (Slack, email) for offboarding signals and immediately audits all access lists, autonomously revoking stale permissions and logging every removal in Mubit as tamper-proof audit evidence.

**Planned integrations:** Slack/HR webhooks (offboarding signal) · GitHub API (collaborator revocation) · Mubit (access removal audit trail) · Bright Data (cross-tool access verification)

**Placeholder:** `lib/agents/offboarding-agent.ts`

---

### 3. Infrastructure Drift Correction

**What it does:** Most cloud breaches trace back to one root cause — a developer made a "quick manual fix" in the AWS console that was never reflected in the Terraform or Kubernetes source code. Guardrail continuously compares live cloud configuration against your declared Infrastructure-as-Code. When a drift is detected it raises a structured decision: *"Manual change detected on AWS Load Balancer security group — revert to source code or update the IaC to match?"*

**Planned integrations:** Bright Data (cloud console scraping) · GitHub API (IaC source reading) · Mubit (drift event audit trail) · Vercel AI Gateway (change classification LLM)

**Placeholder:** `lib/agents/drift-agent.ts`

---

### 4. Regulatory Change Monitoring

**What it does:** Compliance frameworks are not static — the EU AI Act, GDPR amendments, PCI-DSS version updates, and NIST revisions all carry real deadlines and penalties. The agent uses Bright Data to continuously scan government regulatory portals, official law firm bulletins, and standards body release notes for new or amended requirements. It then cross-references your internal policies stored in Mubit and proactively notifies you when a new regulation makes your current security policy outdated — before your next audit, not after.

**Planned integrations:** Bright Data (regulatory portal monitoring) · Mubit (policy document storage + delta comparison) · Vercel AI Gateway (impact assessment LLM)

**Placeholder:** `lib/agents/regulatory-monitor-agent.ts`

---

### Phase 2 architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1 (Live)                                             │
│  GitHub file scan → KB enrichment → LLM analysis → Audit   │
└────────────────────┬────────────────────────────────────────┘
                     │ shared: Mubit audit trail
                     │         Bright Data scraping
                     │         Vercel AI Gateway LLM
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2 (Planned)                                          │
│  ├── TPRM Agent          — vendor Trust Center auditing     │
│  ├── Offboarding Agent   — ghost access detection + revoke  │
│  ├── Drift Agent         — IaC vs live cloud comparison     │
│  └── Reg Monitor Agent   — regulatory change alerting       │
└─────────────────────────────────────────────────────────────┘
```

All Phase 2 agents share the same foundation built in Phase 1: Mubit for persistent memory and audit trails, Bright Data for autonomous web data collection, and the Vercel AI Gateway for LLM reasoning — they are extensions of the pipeline, not rebuilds.

---

## License

MIT
