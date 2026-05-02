"use client"

import { useState, useCallback } from "react"
import type { ScanResult, ScanRequest, ScanLogEntry } from "@/lib/scan-types"

export type ScanStatus = "idle" | "scanning" | "done" | "error"

export interface UseScanReturn {
  status: ScanStatus
  result: ScanResult | null
  streamingLogs: ScanLogEntry[]   // logs drip-fed during scan animation
  error: string | null
  trigger: (req: ScanRequest) => Promise<void>
  reset: () => void
}

/**
 * useScan — calls POST /api/scan, streams the returned log entries into
 * the UI progressively so the terminal feels live, then exposes the full
 * ScanResult when complete.
 */
export function useScan(): UseScanReturn {
  const [status, setStatus] = useState<ScanStatus>("idle")
  const [result, setResult] = useState<ScanResult | null>(null)
  const [streamingLogs, setStreamingLogs] = useState<ScanLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus("idle")
    setResult(null)
    setStreamingLogs([])
    setError(null)
  }, [])

  const trigger = useCallback(async (req: ScanRequest) => {
    setStatus("scanning")
    setResult(null)
    setStreamingLogs([])
    setError(null)

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(errBody.error ?? `HTTP ${res.status}`)
      }

      const data: ScanResult = await res.json()

      // Drip-feed log entries so the terminal animates naturally.
      // Each entry is shown after a short staggered delay.
      const DELAY_MS = 180
      data.logs.forEach((entry, i) => {
        setTimeout(() => {
          setStreamingLogs((prev) => [...prev, entry])
        }, i * DELAY_MS)
      })

      // Mark as done after all logs have been drip-fed
      const totalDelay = data.logs.length * DELAY_MS + 200
      setTimeout(() => {
        setResult(data)
        setStatus("done")
      }, totalDelay)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus("error")
    }
  }, [])

  return { status, result, streamingLogs, error, trigger, reset }
}
