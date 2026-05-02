// ---------------------------------------------------------------------------
// Guardrail AI — shared types used by the API route, hook, and all UI panels
// ---------------------------------------------------------------------------

export type LogLevel = "success" | "warning" | "action" | "info" | "error"

export type Severity = "critical" | "high" | "medium" | "low"

export type ActionType =
  | "Policy Enforced"
  | "Exception Approved"
  | "Auto-Remediated"
  | "No Action"
  | "Alert Sent"

export type DecisionOutcome = "COMPLIANT" | "VIOLATION" | "EXCEPTION_APPROVED"

// ---- Atomic log entry streamed to the Live Action Log ----
export interface ScanLogEntry {
  id: string
  timestamp: string   // HH:MM:SS
  level: LogLevel
  message: string
}

// ---- A single policy violation emitted by the LLM analysis ----
export interface PolicyViolation {
  id: string
  rule: string
  ruleCode: string
  framework: string
  severity: Severity
  confidence: number         // 0-100
  reasoning: string
  context: string            // human-readable resource reference
  timestamp: string          // HH:MM:SS
}

// ---- A single row that goes into the Audit Evidence table ----
export interface AuditEvent {
  id: string
  eventId: string            // EVT-xxxx
  timestamp: string          // ISO-style datetime string
  rule: string
  ruleCode: string
  framework: string
  action: ActionType
  severity: Severity
  reasoning: string
}

// ---- The full payload the API route returns ----
export interface ScanResult {
  scanId: string
  scannedAt: string          // ISO datetime
  target: {
    owner: string
    repo: string
    path: string
  }
  outcome: DecisionOutcome
  hasPriorException: boolean
  complianceScrape?: ComplianceScrapeResult   // populated when a URL was scraped
  logs: ScanLogEntry[]
  violations: PolicyViolation[]
  auditEvents: AuditEvent[]
}

// ---- Request body the client sends to POST /api/scan ----
export interface ScanRequest {
  owner: string
  repo: string
  path: string
  /** Optional URL to scrape for live compliance guidelines (e.g. SOC 2 / GDPR docs). */
  complianceUrl?: string
}

// ---- Metadata about the Bright Data scrape step ----
export interface ComplianceScrapeResult {
  url: string
  scrapedAt: string
  charCount: number
  snippet: string   // first 300 chars, shown in the UI
  cached: boolean
}

// ---- A single compliance document scraped and cached by /api/compliance-docs ----
export interface StoredDoc {
  sourceId: string
  framework: string
  label: string
  url: string
  text: string
  charCount: number
  snippet: string        // first 400 chars
  scrapedAt: string      // ISO datetime
  cacheVersion: string
  status: "ok" | "error"
  errorMessage?: string
}
