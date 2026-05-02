"use client"

import { useState, useEffect } from "react"
import { ShieldCheck, ShieldAlert, Download, RefreshCw, Activity, Github, Folder, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ScanRequest } from "@/lib/scan-types"
import type { ScanStatus } from "@/hooks/use-scan"
import type { ScanResult } from "@/lib/scan-types"

interface SystemHeaderProps {
  isCompliant: boolean
  scanStatus: ScanStatus
  lastScanResult: ScanResult | null
  onScan: (req: ScanRequest) => void
}

export function SystemHeader({
  isCompliant,
  scanStatus,
  lastScanResult,
  onScan,
}: SystemHeaderProps) {
  const [currentTime, setCurrentTime] = useState<string>("")
  const [showScanForm, setShowScanForm] = useState(false)
  const [owner, setOwner] = useState("octocat")
  const [repo, setRepo] = useState("Hello-World")
  const [path, setPath] = useState("README.md")
  const [complianceUrl, setComplianceUrl] = useState("")

  useEffect(() => {
    const update = () =>
      setCurrentTime(new Date().toLocaleTimeString("en-US", { hour12: false }))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  const isScanning = scanStatus === "scanning"

  const handleScan = () => {
    if (!owner.trim() || !repo.trim() || !path.trim()) return
    setShowScanForm(false)
    onScan({
      owner: owner.trim(),
      repo: repo.trim(),
      path: path.trim(),
      ...(complianceUrl.trim() ? { complianceUrl: complianceUrl.trim() } : {}),
    })
  }

  const handleExport = () => {
    if (!lastScanResult) return
    const blob = new Blob([JSON.stringify(lastScanResult, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `guardrail-evidence-${lastScanResult.scanId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const lastScannedLabel = lastScanResult
    ? new Date(lastScanResult.scannedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—"

  return (
    <>
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        {/* Left — brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 border border-primary/30">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-wide text-foreground">Guardrail AI</span>
            <span className="ml-2 text-xs text-muted-foreground font-mono">v2.4.1</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 ml-4 pl-4 border-l border-border text-xs text-muted-foreground font-mono">
            <Activity className="w-3 h-3 text-status-compliant" />
            <span>{currentTime}</span>
          </div>
        </div>

        {/* Center — compliance status badge */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold font-mono tracking-wider transition-all duration-300",
              isScanning
                ? "border-status-info/40 bg-status-info/10 text-status-info"
                : isCompliant
                ? "border-status-compliant/40 bg-status-compliant/10 text-status-compliant"
                : "border-status-violation/40 bg-status-violation/10 text-status-violation"
            )}
          >
            {isScanning ? (
              <>
                <span className="w-2 h-2 rounded-full animate-pulse bg-status-info" />
                SCANNING...
              </>
            ) : isCompliant ? (
              <>
                <span className="w-2 h-2 rounded-full animate-pulse bg-status-compliant" />
                COMPLIANT
              </>
            ) : (
              <>
                <ShieldAlert className="w-3 h-3" />
                VIOLATION DETECTED
              </>
            )}
          </div>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Last Scanned</span>
            <span className="text-xs font-mono text-foreground/80">{lastScannedLabel}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowScanForm((v) => !v)}
            disabled={isScanning}
            className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Configure and trigger scan"
            title="Configure scan"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isScanning && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={!lastScanResult}
            className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary font-mono text-xs gap-1.5 disabled:opacity-40"
          >
            <Download className="w-3 h-3" />
            Evidence Export
          </Button>
        </div>
      </header>

      {/* Scan config form — drops down below the header */}
      {showScanForm && (
        <div className="border-b border-border bg-card/95 backdrop-blur-sm px-6 py-4 z-40">
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-mono text-muted-foreground mb-3 flex items-center gap-1.5">
              <Github className="w-3 h-3" />
              Configure GitHub target for compliance scan
            </p>
            <div className="flex gap-2 items-end flex-wrap">
              <label className="flex flex-col gap-1 flex-1 min-w-28">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Owner</span>
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="octocat"
                  className="px-3 py-1.5 text-xs font-mono bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-28">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Repository</span>
                <input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="my-infra"
                  className="px-3 py-1.5 text-xs font-mono bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </label>
              <label className="flex flex-col gap-1 flex-2 min-w-48">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Folder className="w-3 h-3" /> File Path
                </span>
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="infra/main.tf"
                  className="px-3 py-1.5 text-xs font-mono bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </label>
              <div className="w-full flex gap-2 pt-1 flex-wrap">
                <label className="flex flex-col gap-1 flex-1 min-w-64">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    Compliance Docs URL
                    <span className="text-muted-foreground/50 normal-case tracking-normal">(optional — scraped by Bright Data)</span>
                  </span>
                  <input
                    value={complianceUrl}
                    onChange={(e) => setComplianceUrl(e.target.value)}
                    placeholder="https://... (defaults to AICPA SOC 2 page)"
                    className="px-3 py-1.5 text-xs font-mono bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                </label>
              </div>
              <Button
                onClick={handleScan}
                disabled={!owner.trim() || !repo.trim() || !path.trim()}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs gap-1.5 self-end"
              >
                <ShieldCheck className="w-3 h-3" />
                Run Scan
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowScanForm(false)}
                className="font-mono text-xs text-muted-foreground self-end"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
