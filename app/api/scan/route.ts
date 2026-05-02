import { NextRequest, NextResponse } from "next/server"
import { Octokit } from "octokit"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { randomUUID } from "crypto"
import fs from "fs/promises"
import nodePath from "path"
import type {
  ScanRequest,
  ScanResult,
  ScanLogEntry,
  PolicyViolation,
  AuditEvent,
  DecisionOutcome,
  LogLevel,
  Severity,
  ActionType,
  ComplianceScrapeResult,
} from "@/lib/scan-types"
import type { StoredDoc } from "@/lib/scan-types"
import { COMPLIANCE_SOURCES, SOURCES_CACHE_VERSION, DOCS_CACHE_TTL_MS } from "@/lib/compliance-sources"

// ---------------------------------------------------------------------------
// Multi-document compliance knowledge base reader.
// Reads from the persistent /tmp cache written by /api/compliance-docs.
// Falls back to a single on-demand Bright Data scrape if the cache is empty.
// ---------------------------------------------------------------------------

const CACHE_FILE = nodePath.join("/tmp", "guardrail-compliance-docs.json")

interface CacheFile {
  version: string
  refreshedAt: string
  docs: Record<string, StoredDoc>
}

/**
 * Loads all stored compliance documents from the file-based cache.
 * Returns an empty array if the cache doesn't exist or is expired.
 */
async function loadStoredDocs(): Promise<StoredDoc[]> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8")
    const parsed = JSON.parse(raw) as CacheFile
    if (parsed.version !== SOURCES_CACHE_VERSION) return []
    const now = Date.now()
    return Object.values(parsed.docs).filter(
      (d) => d.status === "ok" && now - new Date(d.scrapedAt).getTime() < DOCS_CACHE_TTL_MS
    )
  } catch {
    return []
  }
}

/**
 * Builds a single enriched compliance context string from stored docs,
 * grouped by framework and capped to avoid exceeding the LLM context window.
 * Each framework contributes up to MAX_CHARS_PER_DOC chars.
 */
const MAX_CHARS_PER_DOC = 800
const MAX_TOTAL_CHARS = 12000

function buildComplianceContext(docs: StoredDoc[]): string {
  if (docs.length === 0) return ""

  const byFramework: Record<string, StoredDoc[]> = {}
  for (const doc of docs) {
    if (!byFramework[doc.framework]) byFramework[doc.framework] = []
    byFramework[doc.framework].push(doc)
  }

  const sections: string[] = []
  let totalChars = 0

  for (const [framework, frameworkDocs] of Object.entries(byFramework)) {
    const excerpts = frameworkDocs
      .map((d) => `[${d.label}]\n${d.text.slice(0, MAX_CHARS_PER_DOC)}`)
      .join("\n\n")

    const section = `=== ${framework} ===\n${excerpts}`
    if (totalChars + section.length > MAX_TOTAL_CHARS) break
    sections.push(section)
    totalChars += section.length
  }

  return sections.join("\n\n")
}

/**
 * On-demand fallback: fetches a single URL for compliance text.
 * Tries Bright Data Web Unlocker first; falls back to a direct fetch
 * if the API key is absent or the call fails.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s{2,}/g, " ")
    .trim()
}

async function scrapeUrlFallback(url: string): Promise<string> {
  const apiKey = process.env.BRIGHT_DATA_API_KEY
  const zone   = process.env.BRIGHT_DATA_ZONE ?? "unlocker"

  if (apiKey) {
    try {
      const response = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ zone, url, format: "raw", country: "us" }),
      })
      if (response.ok) return stripHtml(await response.text())
      const err = await response.text().catch(() => response.statusText)
      console.warn(`[Guardrail] Bright Data ${response.status}: ${err} — falling back to direct fetch`)
    } catch (e) {
      console.warn("[Guardrail] Bright Data threw:", e, "— falling back to direct fetch")
    }
  }

  // Direct fetch fallback
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GuardrailAI/1.0)" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Direct fetch ${res.status} for ${url}`)
  return stripHtml(await res.text())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogEntry(level: LogLevel, message: string): ScanLogEntry {
  return {
    id: randomUUID(),
    timestamp: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    level,
    message,
  }
}

function nowISO() {
  return new Date().toISOString().replace("T", " ").slice(0, 19)
}

function nowHMS() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

// ---------------------------------------------------------------------------
// Mubit SDK shim
// In production, replace with the real `@mubit/sdk` client. The interface
// mirrors the real Mubit API surface so call-sites need no changes.
// ---------------------------------------------------------------------------

interface MubitException {
  id: string
  path: string
  approvedBy: string
  expiresAt: string
  reason: string
}

interface MubitDecisionLog {
  scanId: string
  path: string
  outcome: string
  confidence: number
  reasoning: string
  loggedAt: string
}

const MubitSDK = {
  async getApprovedExceptions(
    path: string,
    _apiKey: string
  ): Promise<MubitException | null> {
    // Replace body with real Mubit REST call:
    //   const res = await fetch(`https://api.mubit.io/v1/exceptions?path=${encodeURIComponent(path)}`, {
    //     headers: { Authorization: `Bearer ${_apiKey}` },
    //   })
    //   return (await res.json()).exception ?? null
    await new Promise((r) => setTimeout(r, 120))
    if (path.includes("infra")) {
      return {
        id: "exc-1042",
        path,
        approvedBy: "CISO",
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
        reason:
          "Pending hardware token procurement for root account MFA. Temporary exception approved under change ticket REF-SEC-1042.",
      }
    }
    return null
  },

  async logDecision(
    entry: Omit<MubitDecisionLog, "loggedAt">,
    _apiKey: string
  ): Promise<void> {
    // Replace body with real Mubit REST call:
    //   await fetch("https://api.mubit.io/v1/decisions", {
    //     method: "POST",
    //     headers: { Authorization: `Bearer ${_apiKey}`, "Content-Type": "application/json" },
    //     body: JSON.stringify({ ...entry, loggedAt: new Date().toISOString() }),
    //   })
    await new Promise((r) => setTimeout(r, 80))
  },
}

// ---------------------------------------------------------------------------
// Policy definitions
// ---------------------------------------------------------------------------

interface PolicyRule {
  ruleCode: string
  framework: string
  rule: string
  severity: Severity
  requirement: string
}

const POLICY_RULES: PolicyRule[] = [
  {
    ruleCode: "GDPR-32.1",
    framework: "GDPR Art. 32",
    rule: "Encryption at Rest Not Enforced",
    severity: "critical",
    requirement:
      "All storage resources must have encryption at rest enabled (storage_encrypted: true, sse_algorithm present, or equivalent). Any resource storing personal data without encryption violates GDPR Article 32.",
  },
  {
    ruleCode: "GDPR-32.2",
    framework: "GDPR Art. 32",
    rule: "Public Storage Bucket Detected",
    severity: "critical",
    requirement:
      "No storage bucket or blob container may have public access enabled (bucket_public: false, acl must not be 'public-read' or 'public-read-write'). Public buckets violate data minimisation and security obligations under GDPR Art. 32.",
  },
  {
    ruleCode: "SOC2-A1.2",
    framework: "SOC 2 Type II",
    rule: "Log Retention Exceeds Policy Window",
    severity: "high",
    requirement:
      "Non-audit log groups must have a retention period between 30 and 90 days. A retention value of 0 (indefinite) is a direct violation of SOC 2 Availability principle A1.2.",
  },
  {
    ruleCode: "SOC2-CC6.3",
    framework: "SOC 2 Type II",
    rule: "Overprivileged IAM Role Detected",
    severity: "high",
    requirement:
      "IAM roles must follow least-privilege. No role may have AdministratorAccess or wildcard (*) action policies attached unless explicitly documented with a time-bound justification.",
  },
  {
    ruleCode: "SOC2-CC6.7",
    framework: "SOC 2 Type II",
    rule: "Network Segmentation Compliant",
    severity: "low",
    requirement:
      "Security groups and network ACLs must restrict inbound traffic to only required ports and CIDR ranges. No security group may allow unrestricted (0.0.0.0/0) inbound on sensitive ports (22, 3306, 5432, etc.).",
  },
]

// ---------------------------------------------------------------------------
// LLM analysis — enriched with live scraped compliance guidelines
// ---------------------------------------------------------------------------

/**
 * Keyword-based pattern match used when ANTHROPIC_API_KEY is absent.
 * Scans file content for rule-specific violation signals and returns a
 * deterministic result so the scan always completes end-to-end.
 */
function patternMatchRule(
  fileContent: string,
  rule: PolicyRule
): { violated: boolean; confidence: number; reasoning: string; resourceContext: string } {
  const content = fileContent.toLowerCase()
  const violationPatterns: Record<string, string[]> = {
    "GDPR-32.1": ["encryption_at_rest.*false", "encrypt.*false", "kms_key.*none", "no.*encrypt"],
    "GDPR-32.2": ["acl.*public", "bucket_public.*true", "public.*true", "public-read"],
    "SOC2-A1.2": ["retention.*0", "log_retention.*0", "retention_days.*[^3-9]"],
    "SOC2-CC6.3": ["\\*.*:.*\\*", "action.*\\*", "resource.*\\*", "admin.*true"],
    "SOC2-CC6.7": ["cidr.*0\\.0\\.0\\.0", "open.*ingress", "0\\.0\\.0\\.0/0"],
  }
  const patterns = violationPatterns[rule.ruleCode] ?? []
  const violated = patterns.some((p) => new RegExp(p).test(content))
  return {
    violated,
    confidence: violated ? 0.78 : 0.82,
    reasoning: violated
      ? `Pattern analysis detected a potential ${rule.rule} violation in the file content. ${rule.requirement} (Pattern-based analysis — LLM unavailable)`
      : `No violation patterns detected for ${rule.rule}. The file appears to satisfy: ${rule.requirement} (Pattern-based analysis — LLM unavailable)`,
    resourceContext: "Pattern analysis — resource context unavailable without LLM",
  }
}

async function analyseFileWithLLM(
  fileContent: string,
  rule: PolicyRule,
  exception: MubitException | null,
  /** Live compliance text fetched by Bright Data — injected into the system prompt */
  scrapedComplianceText: string
): Promise<{
  confidence: number
  reasoning: string
  violated: boolean
  resourceContext: string
}> {
  // Degrade gracefully when no API key is set
  if (!process.env.GOOGLE_API_KEY) {
    return patternMatchRule(fileContent, rule)
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY,
    maxOutputTokens: 700,
    temperature: 0,
  })

  // Trim the scraped text so it fits inside the context window without
  // overwhelming the prompt.  We use the first 4 000 characters which
  // typically covers the most relevant introductory / requirements sections.
  const guidelinesExcerpt = scrapedComplianceText.slice(0, 4000)

  const systemPrompt = `You are a SOC 2 security officer and compliance AI (Guardrail AI). \
You have been provided with the latest compliance guidelines scraped directly from an authoritative source. \
Use this information to inform and ground your analysis.

--- LATEST COMPLIANCE GUIDELINES ---
${guidelinesExcerpt}
--- END COMPLIANCE GUIDELINES ---

Your job:
1. Analyse the provided infrastructure file against the specific policy rule below.
2. Use the compliance guidelines above to validate whether the file configuration meets current requirements.
3. Determine whether the file VIOLATES the policy (true/false).
4. Check the policy: { "bucket_public": false } — no storage bucket may be publicly accessible.
5. Provide a confidence score (0–100) for your determination.
6. Write a concise but technically precise reasoning paragraph (2–4 sentences) suitable for an audit report. \
   Reference the scraped guidelines where relevant.
7. Extract a short "resource context" string identifying the specific resource(s) involved \
   (e.g. "Resource: aws_s3_bucket.uploads | Region: us-east-1").

${
  exception
    ? `IMPORTANT: A prior approved exception exists for this path (ID: ${exception.id}, \
approved by: ${exception.approvedBy}, reason: ${exception.reason}, expires: ${exception.expiresAt}). \
Factor this into your determination — if the exception covers the violation, mark violated=false and explain.`
    : ""
}

Respond ONLY with valid JSON matching this schema (no markdown fences):
{
  "violated": boolean,
  "confidence": number,
  "reasoning": string,
  "resourceContext": string
}`

  const humanPrompt = `Policy Rule: ${rule.ruleCode} — ${rule.rule}
Framework: ${rule.framework}
Requirement: ${rule.requirement}

--- FILE CONTENT ---
${fileContent.slice(0, 8000)}
---`

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(humanPrompt),
  ])

  const rawText =
    typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content.map((c: unknown) => (typeof c === "object" && c !== null && "text" in c ? (c as { text: string }).text : "")).join("")
        : JSON.stringify(response.content)

  // Strip markdown code fences that Gemini sometimes wraps responses in
  const text = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()


  try {
    const parsed = JSON.parse(text)
    return {
      violated: Boolean(parsed.violated),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) > 1 ? Number(parsed.confidence) / 100 : Number(parsed.confidence) || 0.8)),
      reasoning: String(parsed.reasoning || ""),
      resourceContext: String(parsed.resourceContext || `File: ${rule.ruleCode}`),
    }
  } catch {
    // Last resort: try to extract a JSON object from somewhere in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          violated: Boolean(parsed.violated),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence) > 1 ? Number(parsed.confidence) / 100 : Number(parsed.confidence) || 0.8)),
          reasoning: String(parsed.reasoning || ""),
          resourceContext: String(parsed.resourceContext || `File: ${rule.ruleCode}`),
        }
      } catch { /* fall through */ }
    }
    return {
      violated: false,
      confidence: 0.4,
      reasoning: `LLM response could not be parsed. Raw: ${text.slice(0, 120)}. Manual review required for rule ${rule.ruleCode}.`,
      resourceContext: "Unknown resource",
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/scan
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<ScanRequest>
  const { owner, repo, path, complianceUrl } = body

  if (!owner || !repo || !path) {
    return NextResponse.json(
      { error: "Missing required fields: owner, repo, path" },
      { status: 400 }
    )
  }

  const githubToken = process.env.GITHUB_TOKEN
  const mubitKey = process.env.MUBIT_API_KEY ?? "stub"
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  // Note: if anthropicKey is absent, analyseFileWithLLM will log a warning
  // and return a fallback pattern-match result so the scan still completes.

  const scanId = `SCAN-${randomUUID().slice(0, 8).toUpperCase()}`
  const logs: ScanLogEntry[] = []
  const violations: PolicyViolation[] = []
  const auditEvents: AuditEvent[] = []
  let eventCounter = 92

  const log = (level: LogLevel, message: string) => {
    logs.push(makeLogEntry(level, message))
  }

  // ---- Step 1: Initialise ------------------------------------------------
  log("info", `Scan ${scanId} started — target: ${owner}/${repo}/${path}`)
  log("info", `Loading compliance ruleset: ${POLICY_RULES.length} rules`)

  // ---- Step 2: Bright Data — load multi-doc compliance knowledge base ----
  log("info", `[Bright Data] Loading compliance knowledge base from cache...`)

  let scrapedText = ""
  let scrapeResult: ComplianceScrapeResult | undefined

  try {
    // Primary: read from the persistent /tmp cache populated by /api/compliance-docs
    const storedDocs = await loadStoredDocs()

    if (storedDocs.length > 0) {
      scrapedText = buildComplianceContext(storedDocs)
      const frameworks = [...new Set(storedDocs.map((d) => d.framework))].join(", ")
      scrapeResult = {
        url: `Knowledge base: ${storedDocs.length} docs (${frameworks})`,
        scrapedAt: new Date().toISOString(),
        charCount: scrapedText.length,
        snippet: storedDocs.slice(0, 2).map((d) => `[${d.label}] ${d.snippet.slice(0, 120)}`).join(" | "),
        cached: true,
      }
      log(
        "success",
        `[Bright Data] Knowledge base loaded — ${storedDocs.length} compliance docs, ${scrapedText.length.toLocaleString()} chars (${frameworks})`
      )
    } else {
      // Fallback: scrape the supplied/default URL on-demand
      const fallbackUrl =
        complianceUrl ??
        "https://www.aicpa-cima.com/resources/landing/soc-2-reporting-on-an-examination-of-controls-at-a-service-organization-relevant-to-security-availability-processing-integrity-confidentiality-or-privacy"

      log("warning", `[Bright Data] Cache empty — triggering on-demand scrape of: ${fallbackUrl}`)
      const text = await scrapeUrlFallback(fallbackUrl)
      scrapedText = text.slice(0, 8000)
      scrapeResult = {
        url: fallbackUrl,
        scrapedAt: new Date().toISOString(),
        charCount: text.length,
        snippet: text.slice(0, 300),
        cached: false,
      }
      log(
        "success",
        `[Bright Data] Fallback scrape complete — ${text.length.toLocaleString()} chars`
      )
      log(
        "info",
        `[Bright Data] Tip: Run /api/compliance-docs?refresh=true to populate the full knowledge base`
      )
    }

    log("info", `[Bright Data] Knowledge enrichment ready — injecting ${scrapedText.length.toLocaleString()} chars into LLM context`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log("warning", `[Bright Data] Knowledge base load failed: ${msg} — proceeding with built-in policy definitions only`)
  }

  // ---- Step 3: Fetch file from GitHub ------------------------------------
  log("info", `Fetching file via GitHub API: ${owner}/${repo}/${path}`)

  let fileContent: string
  try {
    const octokit = new Octokit({ auth: githubToken })
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path })

    if (Array.isArray(data) || data.type !== "file") {
      return NextResponse.json(
        { error: "Path must point to a file, not a directory." },
        { status: 400 }
      )
    }

    fileContent = Buffer.from(data.content, "base64").toString("utf-8")
    log(
      "success",
      `File fetched — ${fileContent.split("\n").length} lines, ${fileContent.length} bytes`
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log("warning", `GitHub fetch failed (${msg}) — falling back to stub file content for demonstration`)
    fileContent = generateStubFileContent(path)
    log("info", `Stub file content generated (${fileContent.split("\n").length} lines) — analysis will proceed`)
  }

  // ---- Step 4: Check Mubit for prior exceptions -------------------------
  log("info", "Querying Mubit SDK for approved exception history...")
  const exception = await MubitSDK.getApprovedExceptions(path, mubitKey)
  if (exception) {
    log(
      "warning",
      `Mubit Memory: Prior exception found — ID ${exception.id} (approved by ${exception.approvedBy}, expires ${new Date(exception.expiresAt).toLocaleDateString()})`
    )
  } else {
    log("info", "Mubit Memory: No prior exceptions for this path")
  }

  // ---- Step 5: Run LLM analysis per policy rule (with enriched context) --
  log(
    "info",
    `Starting LLM compliance analysis across ${POLICY_RULES.length} policy rules (knowledge-enriched)...`
  )

  for (const rule of POLICY_RULES) {
    log("info", `Analysing rule ${rule.ruleCode}: ${rule.rule}`)

    let analysis: Awaited<ReturnType<typeof analyseFileWithLLM>>
    try {
      analysis = await analyseFileWithLLM(fileContent, rule, exception, scrapedText)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log("error", `LLM analysis failed for ${rule.ruleCode}: ${msg}`)
      auditEvents.push({
        id: randomUUID(),
        eventId: `EVT-${String(eventCounter--).padStart(4, "0")}`,
        timestamp: nowISO(),
        rule: rule.rule,
        ruleCode: rule.ruleCode,
        framework: rule.framework,
        action: "No Action",
        severity: rule.severity,
        reasoning: `LLM analysis could not be completed: ${msg}. Manual review required.`,
      })
      continue
    }

    if (analysis.violated) {
      log(
        "error",
        `Rule ${rule.ruleCode} VIOLATED: ${rule.rule} (confidence ${analysis.confidence}%)`
      )

      const action: ActionType = exception ? "Exception Approved" : "Policy Enforced"
      violations.push({
        id: randomUUID(),
        rule: rule.rule,
        ruleCode: rule.ruleCode,
        framework: rule.framework,
        severity: rule.severity,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        context: analysis.resourceContext,
        timestamp: nowHMS(),
      })

      log(
        "action",
        exception
          ? `Exception ${exception.id} applied — violation acknowledged but deferred`
          : `Action Taken: Policy Enforced for ${rule.ruleCode}`
      )

      auditEvents.push({
        id: randomUUID(),
        eventId: `EVT-${String(eventCounter--).padStart(4, "0")}`,
        timestamp: nowISO(),
        rule: rule.rule,
        ruleCode: rule.ruleCode,
        framework: rule.framework,
        action,
        severity: rule.severity,
        reasoning: analysis.reasoning,
      })
    } else {
      log(
        "success",
        `Rule ${rule.ruleCode} passed (confidence ${analysis.confidence}%)`
      )

      auditEvents.push({
        id: randomUUID(),
        eventId: `EVT-${String(eventCounter--).padStart(4, "0")}`,
        timestamp: nowISO(),
        rule: rule.rule,
        ruleCode: rule.ruleCode,
        framework: rule.framework,
        action: "No Action",
        severity: rule.severity,
        reasoning: analysis.reasoning,
      })
    }
  }

  // ---- Step 6: Determine overall outcome --------------------------------
  const outcome: DecisionOutcome =
    violations.length === 0
      ? "COMPLIANT"
      : exception
      ? "EXCEPTION_APPROVED"
      : "VIOLATION"

  log(
    outcome === "COMPLIANT" ? "success" : "warning",
    `Scan complete — outcome: ${outcome} | ${violations.length} violation(s) across ${POLICY_RULES.length} rules`
  )

  // ---- Step 7: Persist decisions to Mubit audit log ---------------------
  for (const violation of violations) {
    await MubitSDK.logDecision(
      {
        scanId,
        path,
        outcome: violation.ruleCode,
        confidence: violation.confidence,
        reasoning: violation.reasoning,
      },
      mubitKey
    )
  }
  if (violations.length > 0) {
    log("info", `${violations.length} decision(s) logged to Mubit audit trail`)
  }

  // ---- Return result -----------------------------------------------------
  const result: ScanResult = {
    scanId,
    scannedAt: new Date().toISOString(),
    target: { owner, repo, path },
    outcome,
    hasPriorException: exception !== null,
    complianceScrape: scrapeResult,
    logs,
    violations,
    auditEvents,
  }

  return NextResponse.json(result, { status: 200 })
}

// ---------------------------------------------------------------------------
// Stub file generator — used when GITHUB_TOKEN is absent
// ---------------------------------------------------------------------------

function generateStubFileContent(path: string): string {
  const filename = path.split("/").pop() ?? "config"
  return `# ${filename} — stub infrastructure definition (demo mode)
# Generated by Guardrail AI when GITHUB_TOKEN is not configured.

resource "aws_db_instance" "db-prod-01" {
  allocated_storage    = 20
  engine               = "postgres"
  instance_class       = "db.t3.micro"
  identifier           = "db-prod-01"
  storage_encrypted    = false          # VIOLATION: GDPR-32.1
  tags = {
    Environment = "production"
    DataClass   = "PII"
  }
}

resource "aws_s3_bucket" "uploads-staging" {
  bucket = "uploads-staging-20240312"
  acl    = "public-read"               # VIOLATION: GDPR-32.2
  tags = {
    Environment = "staging"
  }
}

resource "aws_cloudwatch_log_group" "auth_service" {
  name              = "/aws/lambda/auth-service"
  retention_in_days = 0                 # VIOLATION: SOC2-A1.2 (indefinite)
}

resource "aws_iam_role_policy_attachment" "dev_admin" {
  role       = "dev-full-access"
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"  # VIOLATION: SOC2-CC6.3
}

resource "aws_security_group" "app_sg" {
  name = "app-security-group"
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]       # COMPLIANT: SOC2-CC6.7
  }
}
`
}
