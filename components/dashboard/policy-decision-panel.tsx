"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Wrench,
  ChevronDown,
  ChevronUp,
  Zap,
  ShieldCheck,
  Loader2,
  Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PolicyViolation, ComplianceScrapeResult } from "@/lib/scan-types"
import type { ScanStatus } from "@/hooks/use-scan"

interface PolicyDecisionPanelProps {
  violations: PolicyViolation[]
  scanStatus: ScanStatus
  hasPriorException: boolean
  complianceScrape?: ComplianceScrapeResult
}

const severityConfig = {
  critical: {
    label: "CRITICAL",
    color: "text-status-violation",
    border: "border-status-violation/50",
    bg: "bg-status-violation/10",
    stripe: "bg-status-violation",
  },
  high: {
    label: "HIGH",
    color: "text-status-warning",
    border: "border-status-warning/50",
    bg: "bg-status-warning/10",
    stripe: "bg-status-warning",
  },
  medium: {
    label: "MEDIUM",
    color: "text-status-info",
    border: "border-status-info/50",
    bg: "bg-status-info/10",
    stripe: "bg-status-info",
  },
  low: {
    label: "LOW",
    color: "text-muted-foreground",
    border: "border-border",
    bg: "bg-secondary/50",
    stripe: "bg-muted-foreground",
  },
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            value >= 90
              ? "bg-status-violation"
              : value >= 70
              ? "bg-status-warning"
              : "bg-status-compliant"
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-mono font-bold text-foreground">{value}%</span>
    </div>
  )
}

export function PolicyDecisionPanel({
  violations,
  scanStatus,
  hasPriorException,
  complianceScrape,
}: PolicyDecisionPanelProps) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showReasoning, setShowReasoning] = useState(false)
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [actionFeedback, setActionFeedback] = useState<{
    id: string
    type: "approved" | "remediated"
  } | null>(null)

  const isScanning = scanStatus === "scanning"

  // Reset index when new violations arrive
  const safeIdx = Math.min(currentIdx, Math.max(violations.length - 1, 0))
  const violation = violations[safeIdx] ?? null

  const isResolved = violation ? resolvedIds.has(violation.id) : false
  const sev = violation ? severityConfig[violation.severity] : null

  const handleAction = (type: "approved" | "remediated") => {
    if (!violation) return
    setActionFeedback({ id: violation.id, type })
    setResolvedIds((prev) => new Set([...prev, violation.id]))
    setTimeout(() => {
      setActionFeedback(null)
      const next = violations.findIndex(
        (v) => !resolvedIds.has(v.id) && v.id !== violation.id
      )
      if (next !== -1) setCurrentIdx(next)
    }, 1800)
  }

  const frameworksSet = new Set(violations.map((v) => v.framework))
  const pendingCount = violations.filter((v) => !resolvedIds.has(v.id)).length

  // ---- Loading state ----
  if (isScanning) {
    return (
      <section className="flex flex-col gap-4" aria-label="Policy Decision Panel">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-status-info animate-spin" />
          <h2 className="text-sm font-semibold text-foreground">Policy Decision</h2>
          <span className="text-xs font-mono text-muted-foreground">Analysing with Claude...</span>
        </div>
        <div className="rounded-lg border border-border p-8 bg-card flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-status-info/30 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-status-info animate-spin" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Running compliance analysis</p>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              LangChain + Claude is comparing file content against policy rules...
            </p>
          </div>
        </div>
      </section>
    )
  }

  // ---- Idle / no violations ----
  if (violations.length === 0) {
    return (
      <section className="flex flex-col gap-4" aria-label="Policy Decision Panel">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Policy Decision</h2>
        </div>
        <div className="rounded-lg border border-border p-8 bg-card flex flex-col items-center gap-4 text-center">
          {scanStatus === "done" ? (
            <>
              <ShieldCheck className="w-10 h-10 text-status-compliant" />
              <div>
                <p className="text-sm font-semibold text-status-compliant">All Checks Passed</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  No policy violations detected in the scanned file.
                </p>
              </div>
            </>
          ) : (
            <>
              <ShieldCheck className="w-10 h-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-semibold text-foreground">No scan results yet</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  Click the rescan button in the header to run a compliance scan.
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    )
  }

  // ---- Active violations view ----
  return (
    <section className="flex flex-col gap-4" aria-label="Policy Decision Panel">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-status-violation" />
          <h2 className="text-sm font-semibold text-foreground">Policy Decision</h2>
          {hasPriorException && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-status-warning/40 bg-status-warning/10 text-status-warning">
              EXCEPTION ON FILE
            </span>
          )}
          {complianceScrape && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border",
                complianceScrape.cached
                  ? "border-status-info/30 bg-status-info/10 text-status-info"
                  : "border-status-compliant/30 bg-status-compliant/10 text-status-compliant"
              )}
              title={`Scraped from: ${complianceScrape.url}\n${complianceScrape.charCount.toLocaleString()} chars • ${new Date(complianceScrape.scrapedAt).toLocaleTimeString()}`}
            >
              <Globe className="w-2.5 h-2.5" />
              BRIGHT DATA {complianceScrape.cached ? "CACHE HIT" : "LIVE SCRAPE"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {violations.map((v, i) => (
            <button
              key={v.id}
              onClick={() => { setCurrentIdx(i); setShowReasoning(false) }}
              className={cn(
                "w-5 h-5 rounded text-[10px] font-mono border transition-colors",
                safeIdx === i
                  ? "border-primary bg-primary/20 text-primary"
                  : resolvedIds.has(v.id)
                  ? "border-status-compliant/40 bg-status-compliant/10 text-status-compliant"
                  : "border-border text-muted-foreground hover:border-primary/50"
              )}
              aria-label={`View violation ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
          <span className="ml-2 text-xs font-mono text-muted-foreground">
            {pendingCount} pending
          </span>
        </div>
      </div>

      {/* Violation Card */}
      {violation && sev && (
        <div
          className={cn(
            "rounded-lg border p-5 bg-card relative overflow-hidden",
            sev.border
          )}
        >
          {/* Top accent stripe */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-0.5",
              isResolved ? "bg-status-compliant" : sev.stripe
            )}
          />

          {/* Action feedback overlay */}
          {actionFeedback && actionFeedback.id === violation.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/90 rounded-lg z-10">
              <div
                className={cn(
                  "flex items-center gap-2 text-sm font-semibold",
                  actionFeedback.type === "approved"
                    ? "text-status-compliant"
                    : "text-status-info"
                )}
              >
                <CheckCircle2 className="w-5 h-5" />
                {actionFeedback.type === "approved"
                  ? "Exception Approved"
                  : "Auto-Remediation Triggered"}
              </div>
            </div>
          )}

          {/* Card header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={cn(
                    "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border",
                    sev.color,
                    sev.border,
                    sev.bg
                  )}
                >
                  {sev.label}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  {violation.ruleCode}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  {violation.framework}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground text-balance">
                {violation.rule}
              </h3>
              <p className="text-xs font-mono text-muted-foreground mt-1 break-all">
                {violation.context}
              </p>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-1">
              {violation.timestamp}
            </span>
          </div>

          {/* Confidence */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Confidence Score
              </span>
            </div>
            <ConfidenceBar value={violation.confidence} />
          </div>

          {/* Agent Reasoning */}
          <div className="mb-5">
            <button
              onClick={() => setShowReasoning((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-2 group"
            >
              <Brain className="w-3 h-3 group-hover:text-primary transition-colors" />
              Agent Reasoning
              {showReasoning ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
            <div
              className={cn(
                "overflow-hidden transition-all duration-300",
                showReasoning ? "max-h-48 opacity-100" : "max-h-12 opacity-80"
              )}
            >
              <div
                className={cn(
                  "text-xs text-foreground/80 leading-relaxed border-l-2 pl-3 font-mono",
                  showReasoning ? "border-primary/50" : "border-border"
                )}
              >
                {showReasoning
                  ? violation.reasoning
                  : violation.reasoning.slice(0, 120) + "..."}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => handleAction("approved")}
              disabled={isResolved}
              variant="outline"
              className="flex-1 border-status-compliant/50 text-status-compliant hover:bg-status-compliant/10 hover:border-status-compliant font-semibold gap-2 transition-colors disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve Exception
            </Button>
            <Button
              onClick={() => handleAction("remediated")}
              disabled={isResolved}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2 transition-colors disabled:opacity-40"
            >
              <Wrench className="w-4 h-4" />
              Auto-Remediate
            </Button>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Violations",
            value: violations.length,
            color: "text-status-violation",
          },
          {
            label: "Resolved",
            value: resolvedIds.size,
            color: "text-status-compliant",
          },
          {
            label: "Frameworks",
            value: frameworksSet.size,
            color: "text-status-info",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-lg px-4 py-3 text-center"
          >
            <div className={cn("text-xl font-bold font-mono", stat.color)}>
              {stat.value}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
