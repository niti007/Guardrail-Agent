"use client"

import { useEffect, useRef } from "react"
import { Terminal, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScanLogEntry, LogLevel } from "@/lib/scan-types"
import type { ScanStatus } from "@/hooks/use-scan"

interface LiveActionLogProps {
  logs: ScanLogEntry[]
  scanStatus: ScanStatus
  onClear: () => void
}

const levelConfig: Record<LogLevel, { label: string; color: string; borderBg: string }> = {
  success: {
    label: "SUCCESS",
    color: "text-status-compliant",
    borderBg: "border-status-compliant/30 bg-status-compliant/10",
  },
  warning: {
    label: "WARNING",
    color: "text-status-warning",
    borderBg: "border-status-warning/30 bg-status-warning/10",
  },
  action: {
    label: "ACTION",
    color: "text-status-action",
    borderBg: "border-status-action/30 bg-status-action/10",
  },
  info: {
    label: "INFO",
    color: "text-status-info",
    borderBg: "border-status-info/30 bg-status-info/10",
  },
  error: {
    label: "ERROR",
    color: "text-status-violation",
    borderBg: "border-status-violation/30 bg-status-violation/10",
  },
}

export function LiveActionLog({ logs, scanStatus, onClear }: LiveActionLogProps) {
  const safeLogs: ScanLogEntry[] = Array.isArray(logs) ? logs : []
  const scrollRef = useRef<HTMLDivElement>(null)
  const isLive = scanStatus === "scanning"

  // Auto-scroll whenever logs grow
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [safeLogs])

  return (
    <aside className="flex flex-col h-full bg-card border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground tracking-wide uppercase">
            Live Action Log
          </span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded border transition-colors",
            isLive
              ? "border-status-compliant/40 text-status-compliant bg-status-compliant/10"
              : scanStatus === "done"
              ? "border-status-info/40 text-status-info bg-status-info/10"
              : "border-border text-muted-foreground"
          )}
        >
          <Circle className={cn("w-1.5 h-1.5 fill-current", isLive && "animate-pulse")} />
          {isLive ? "LIVE" : scanStatus === "done" ? "COMPLETE" : "IDLE"}
        </div>
      </div>

      {/* Log feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-1 font-mono text-[11px] leading-relaxed scroll-smooth"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-border) transparent" }}
        aria-label="Agent activity log"
        aria-live="polite"
      >
        {safeLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Terminal className="w-8 h-8 opacity-20" />
            <p className="text-xs text-center">
              No logs yet.
              <br />
              Click <span className="text-foreground/60">Rescan</span> to run a compliance scan.
            </p>
          </div>
        )}

        {safeLogs.map((entry) => {
          const cfg = levelConfig[entry.level]
          return (
            <div key={entry.id} className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0 mt-0.5 select-none">
                {entry.timestamp}
              </span>
              <span
                className={cn(
                  "shrink-0 px-1.5 py-0 rounded text-[9px] font-bold tracking-widest border",
                  cfg.color,
                  cfg.borderBg
                )}
              >
                {cfg.label}
              </span>
              <span
                className={cn(
                  "break-all",
                  entry.level === "error"
                    ? "text-status-violation"
                    : entry.level === "action"
                    ? "text-status-action"
                    : "text-foreground/80"
                )}
              >
                {entry.message}
              </span>
            </div>
          )
        })}

        {/* Blinking cursor */}
        {(isLive || safeLogs.length > 0) && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground select-none opacity-0">00:00:00</span>
            <span className="w-2 h-3.5 bg-primary/70 animate-pulse inline-block" aria-hidden />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">{safeLogs.length} events</span>
        <button
          onClick={onClear}
          disabled={safeLogs.length === 0}
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
        >
          Clear
        </button>
      </div>
    </aside>
  )
}
