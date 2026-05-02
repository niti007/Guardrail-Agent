"use client"

import { useState, useCallback } from "react"
import {
  RefreshCw,
  Globe,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Database,
  BookOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { COMPLIANCE_SOURCES, type ComplianceFramework } from "@/lib/compliance-sources"
import type { StoredDoc } from "@/lib/scan-types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefreshResponse {
  fromCache?: boolean
  refreshedAt: string
  scraped?: number
  successCount?: number
  errorCount?: number
  docs: StoredDoc[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FRAMEWORK_COLORS: Record<ComplianceFramework, string> = {
  "SOC 2":     "border-status-info/40 bg-status-info/10 text-status-info",
  "GDPR":      "border-status-compliant/40 bg-status-compliant/10 text-status-compliant",
  "HIPAA":     "border-status-action/40 bg-status-action/10 text-status-action",
  "ISO 27001": "border-status-warning/40 bg-status-warning/10 text-status-warning",
  "PCI-DSS":   "border-status-violation/40 bg-status-violation/10 text-status-violation",
  "NIST CSF":  "border-primary/40 bg-primary/10 text-primary",
}

function formatAge(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DocRow({ doc }: { doc: StoredDoc }) {
  const [expanded, setExpanded] = useState(false)
  const isOk = doc.status === "ok"

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left"
        aria-expanded={expanded}
      >
        {isOk ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-status-compliant shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-status-violation shrink-0" />
        )}

        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-foreground truncate">{doc.label}</span>
          {isOk ? (
            <span className="text-[10px] font-mono text-muted-foreground">
              {doc.charCount.toLocaleString()} chars &middot; {formatAge(doc.scrapedAt)}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-status-violation truncate block">
              {doc.errorMessage ?? "Scrape failed"}
            </span>
          )}
        </span>

        <span
          className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0",
            FRAMEWORK_COLORS[doc.framework] ?? "border-border text-muted-foreground"
          )}
        >
          {doc.framework}
        </span>

        {expanded ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && isOk && (
        <div className="px-4 pb-3 pt-0">
          <div className="bg-secondary/50 rounded p-3 border border-border/50">
            <p className="text-[10px] font-mono text-muted-foreground leading-relaxed line-clamp-4">
              {doc.snippet}
              {doc.text.length > doc.snippet.length && (
                <span className="text-muted-foreground/50"> …({(doc.charCount - 400).toLocaleString()} more chars stored)</span>
              )}
            </p>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Globe className="w-2.5 h-2.5" />
              View source
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ComplianceDocsPanel() {
  const [docs, setDocs] = useState<StoredDoc[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [meta, setMeta] = useState<{ refreshedAt: string; fromCache: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const totalSources = COMPLIANCE_SOURCES.length
  const successCount = docs.filter((d) => d.status === "ok").length
  const errorCount = docs.filter((d) => d.status === "error").length

  const fetchDocs = useCallback(async (force = false) => {
    setStatus("loading")
    setError(null)
    try {
      const url = force
        ? "/api/compliance-docs?refresh=true"
        : "/api/compliance-docs"
      const res = await fetch(url)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = (await res.json()) as RefreshResponse
      setDocs(data.docs ?? [])
      setMeta({ refreshedAt: data.refreshedAt, fromCache: data.fromCache ?? false })
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      setStatus("error")
    }
  }, [])

  const frameworks = [...new Set(COMPLIANCE_SOURCES.map((s) => s.framework))]

  return (
    <section
      className="flex flex-col bg-card border border-border rounded-lg overflow-hidden"
      aria-label="Compliance Knowledge Base"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
        <Database className="w-4 h-4 text-primary shrink-0" />
        <h2 className="text-sm font-semibold text-foreground flex-1">Compliance Knowledge Base</h2>

        {status === "done" && meta && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {meta.fromCache ? "cached" : "fresh"} &middot; {formatAge(meta.refreshedAt)}
          </span>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchDocs(true)}
          disabled={status === "loading"}
          className="h-6 px-2 text-[10px] font-mono text-muted-foreground hover:text-foreground gap-1"
          title="Re-scrape all compliance sources via Bright Data"
        >
          <RefreshCw className={cn("w-3 h-3", status === "loading" && "animate-spin")} />
          {status === "loading" ? "Scraping..." : "Refresh"}
        </Button>

        <button
          onClick={() => setCollapsed((p) => !p)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Framework badges + stats */}
          <div className="px-4 py-2.5 border-b border-border/50 flex flex-wrap items-center gap-2">
            {frameworks.map((fw) => (
              <span
                key={fw}
                className={cn(
                  "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                  FRAMEWORK_COLORS[fw] ?? "border-border text-muted-foreground"
                )}
              >
                {fw}
              </span>
            ))}
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
              {totalSources} sources
            </span>
          </div>

          {/* Idle state */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground opacity-30" />
              <p className="text-xs text-muted-foreground">
                Knowledge base not yet loaded.
                <br />
                Click <span className="text-foreground/70">Refresh</span> to scrape{" "}
                {totalSources} compliance sources via Bright Data.
              </p>
              <Button
                size="sm"
                onClick={() => fetchDocs(true)}
                className="bg-primary/90 hover:bg-primary text-primary-foreground font-mono text-xs gap-1.5 mt-1"
              >
                <Globe className="w-3 h-3" />
                Load Knowledge Base
              </Button>
            </div>
          )}

          {/* Loading state */}
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
              <p className="text-xs font-mono text-muted-foreground">
                Scraping {totalSources} compliance sources via Bright Data...
              </p>
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="px-4 py-6 flex flex-col items-center gap-2">
              <XCircle className="w-6 h-6 text-status-violation" />
              <p className="text-xs font-mono text-status-violation text-center">{error}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchDocs(true)}
                className="text-xs font-mono mt-1"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Loaded docs */}
          {status === "done" && docs.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="px-4 py-2 border-b border-border/50 flex items-center gap-3 bg-muted/20">
                <span className="flex items-center gap-1 text-[10px] font-mono text-status-compliant">
                  <CheckCircle2 className="w-3 h-3" />
                  {successCount} indexed
                </span>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-status-violation">
                    <XCircle className="w-3 h-3" />
                    {errorCount} failed
                  </span>
                )}
                <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground ml-auto">
                  <Clock className="w-3 h-3" />
                  {docs.reduce((a, d) => a + d.charCount, 0).toLocaleString()} chars total
                </span>
              </div>

              {/* Doc list */}
              <div className="overflow-y-auto max-h-72">
                {docs.map((doc) => (
                  <DocRow key={doc.sourceId} doc={doc} />
                ))}
              </div>
            </>
          )}

          {status === "done" && docs.length === 0 && (
            <div className="px-4 py-6 text-center text-xs font-mono text-muted-foreground">
              No documents found in cache. Click Refresh to scrape.
            </div>
          )}
        </>
      )}
    </section>
  )
}
