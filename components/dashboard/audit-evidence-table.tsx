"use client"

import { useState } from "react"
import {
  ClipboardList,
  Eye,
  X,
  Brain,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AuditEvent, ActionType } from "@/lib/scan-types"

// --- Default audit history shown before any real scan runs ---
const DEFAULT_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: "default-1",
    eventId: "EVT-0085",
    timestamp: "2025-05-02 12:55:33",
    rule: "Network Segmentation Compliant",
    ruleCode: "SOC2-CC6.7",
    framework: "SOC 2",
    action: "No Action",
    severity: "low",
    reasoning:
      "CC6.7 network logical access controls reviewed. VPC peering routes, security group ingress rules, and NACLs all conform to the approved architecture diagram (v3.2). No violations detected. Confidence: 98%.",
  },
  {
    id: "default-2",
    eventId: "EVT-0084",
    timestamp: "2025-05-02 12:30:07",
    rule: "Backup Encryption Verified",
    ruleCode: "GDPR-32.1",
    framework: "GDPR",
    action: "No Action",
    severity: "low",
    reasoning:
      "Automated backup snapshots verified to use AES-256-GCM at rest. S3 backup buckets use SSE-KMS with customer-managed key (CMK) rotation enabled. Confidence: 98%.",
  },
]

interface AuditEvidenceTableProps {
  /** New events from the latest scan — prepended before the default history */
  scanEvents: AuditEvent[]
}

const actionConfig: Record<ActionType, { color: string; border: string; bg: string }> = {
  "Policy Enforced": {
    color: "text-status-action",
    border: "border-status-action/40",
    bg: "bg-status-action/10",
  },
  "Exception Approved": {
    color: "text-status-warning",
    border: "border-status-warning/40",
    bg: "bg-status-warning/10",
  },
  "Auto-Remediated": {
    color: "text-status-info",
    border: "border-status-info/40",
    bg: "bg-status-info/10",
  },
  "No Action": {
    color: "text-muted-foreground",
    border: "border-border",
    bg: "bg-secondary/50",
  },
  "Alert Sent": {
    color: "text-status-violation",
    border: "border-status-violation/40",
    bg: "bg-status-violation/10",
  },
}

const severityConfig = {
  critical: "text-status-violation",
  high: "text-status-warning",
  medium: "text-status-info",
  low: "text-muted-foreground",
}

const PAGE_SIZE = 5

interface ReasoningModalProps {
  event: AuditEvent
  onClose: () => void
}

function ReasoningModal({ event, onClose }: ReasoningModalProps) {
  const ac = actionConfig[event.action]
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Reasoning for ${event.eventId}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
                {event.eventId}
              </span>
              <span
                className={cn(
                  "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border",
                  ac.color,
                  ac.border,
                  ac.bg
                )}
              >
                {event.action.toUpperCase()}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground text-balance">{event.rule}</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {event.ruleCode} · {event.framework} · {event.timestamp}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors ml-4 mt-0.5 shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto max-h-80">
          <div className="flex items-center gap-1.5 mb-3">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Agent Reasoning
            </span>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed font-mono border-l-2 border-primary/50 pl-3">
            {event.reasoning}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-mono border-border hover:bg-secondary"
            onClick={onClose}
          >
            Close
          </Button>
          <Button
            size="sm"
            className="text-xs font-mono bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => {
              const blob = new Blob([JSON.stringify(event, null, 2)], {
                type: "application/json",
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = `guardrail-${event.eventId}.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export Evidence
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AuditEvidenceTable({ scanEvents }: AuditEvidenceTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")

  // Merge real scan events (newest first) with the static history
  const allEvents: AuditEvent[] = [...scanEvents, ...DEFAULT_AUDIT_EVENTS]

  const filtered = allEvents.filter(
    (e) =>
      e.rule.toLowerCase().includes(search.toLowerCase()) ||
      e.eventId.toLowerCase().includes(search.toLowerCase()) ||
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.ruleCode.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageEvents = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <section aria-label="Audit-Ready Evidence Table">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Audit-Ready Evidence</h2>
          <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
            {allEvents.length} events
          </span>
          {scanEvents.length > 0 && (
            <span className="text-[10px] font-mono border border-status-info/40 bg-status-info/10 text-status-info rounded px-1.5 py-0.5">
              +{scanEvents.length} from latest scan
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-7 pr-3 py-1 text-xs font-mono bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-44"
              aria-label="Search audit events"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Event ID", "Timestamp", "Rule", "Severity", "Action", ""].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
                      h === "" ? "text-right" : "text-left"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageEvents.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground font-mono text-xs"
                  >
                    No matching events found.
                  </td>
                </tr>
              ) : (
                pageEvents.map((event, i) => {
                  const ac = actionConfig[event.action]
                  const isNew = scanEvents.some((e) => e.id === event.id)
                  return (
                    <tr
                      key={event.id}
                      className={cn(
                        "border-b border-border/50 hover:bg-secondary/40 transition-colors",
                        i === pageEvents.length - 1 && "border-b-0",
                        isNew && "bg-primary/5"
                      )}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-primary">
                        {event.eventId}
                        {isNew && (
                          <span className="ml-1.5 text-[9px] border border-status-info/40 bg-status-info/10 text-status-info rounded px-1 py-0.5 font-mono">
                            NEW
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                        {event.timestamp}
                      </td>
                      <td className="px-4 py-3 text-foreground/90 max-w-xs">
                        <div className="truncate">{event.rule}</div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          {event.ruleCode} · {event.framework}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "font-mono font-bold text-[10px] uppercase",
                            severityConfig[event.severity]
                          )}
                        >
                          {event.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded border text-[10px] font-mono font-semibold whitespace-nowrap",
                            ac.color,
                            ac.border,
                            ac.bg
                          )}
                        >
                          {event.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEvent(event)}
                          className="h-6 px-2 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-[10px] font-mono text-muted-foreground">
              Page {page} of {totalPages} · {filtered.length} events
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3 h-3" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "w-6 h-6 text-[10px] font-mono rounded border transition-colors",
                    page === p
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {p}
                </button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedEvent && (
        <ReasoningModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </section>
  )
}
