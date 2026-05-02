"use client"

import { useScan } from "@/hooks/use-scan"
import { SystemHeader } from "@/components/dashboard/system-header"
import { LiveActionLog } from "@/components/dashboard/live-action-log"
import { PolicyDecisionPanel } from "@/components/dashboard/policy-decision-panel"
import { AuditEvidenceTable } from "@/components/dashboard/audit-evidence-table"
import { ComplianceDocsPanel } from "@/components/dashboard/compliance-docs-panel"
import type { ScanRequest } from "@/lib/scan-types"

export default function DashboardPage() {
  const { status, result, streamingLogs, trigger, reset } = useScan()

  const handleScan = (req: ScanRequest) => {
    trigger(req)
  }

  const handleClearLogs = () => {
    reset()
  }

  const isCompliant =
    status === "done" && result !== null && result.violations.length === 0

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SystemHeader
        isCompliant={isCompliant}
        scanStatus={status}
        lastScanResult={result}
        onScan={handleScan}
      />

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 57px)" }}>
        {/* Left sidebar — Live Action Log */}
        <div className="hidden lg:flex w-72 xl:w-80 shrink-0 overflow-hidden">
          <LiveActionLog
            logs={streamingLogs}
            scanStatus={status}
            onClear={handleClearLogs}
          />
        </div>

        {/* Main scrollable content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-5 lg:p-6 space-y-6 max-w-4xl mx-auto">
            {/* Mobile: collapsible Live Log */}
            <div className="lg:hidden">
              <details className="bg-card border border-border rounded-lg overflow-hidden">
                <summary className="px-4 py-3 text-xs font-mono font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-compliant animate-pulse inline-block" />
                  Live Action Log ({streamingLogs.length} events)
                </summary>
                <div className="h-64">
                  <LiveActionLog
                    logs={streamingLogs}
                    scanStatus={status}
                    onClear={handleClearLogs}
                  />
                </div>
              </details>
            </div>

            {/* Policy Decision Panel */}
            <PolicyDecisionPanel
              violations={result?.violations ?? []}
              scanStatus={status}
              hasPriorException={result?.hasPriorException ?? false}
              complianceScrape={result?.complianceScrape}
            />

            <div className="border-t border-border" />

            {/* Audit Evidence Table */}
            <AuditEvidenceTable scanEvents={result?.auditEvents ?? []} />

            <div className="border-t border-border" />

            {/* Compliance Knowledge Base */}
            <ComplianceDocsPanel />

            <div className="h-4" />
          </div>
        </main>
      </div>
    </div>
  )
}
