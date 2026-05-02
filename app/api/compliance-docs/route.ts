import { NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import {
  COMPLIANCE_SOURCES,
  SOURCES_CACHE_VERSION,
  DOCS_CACHE_TTL_MS,
  type ComplianceFramework,
} from "@/lib/compliance-sources"
import type { StoredDoc } from "@/lib/scan-types"

// ---------------------------------------------------------------------------
// Persistent file-based cache stored in /tmp (writable on Vercel serverless).
// The cache file is a JSON object keyed by source ID.
// ---------------------------------------------------------------------------

const CACHE_FILE = path.join("/tmp", "guardrail-compliance-docs.json")

interface CacheFile {
  version: string
  refreshedAt: string
  docs: Record<string, StoredDoc>
}

// ---------------------------------------------------------------------------
// File cache helpers
// ---------------------------------------------------------------------------

async function readCache(): Promise<CacheFile | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8")
    const parsed = JSON.parse(raw) as CacheFile
    // Invalidate if cache version changed (source list was updated)
    if (parsed.version !== SOURCES_CACHE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

async function writeCache(data: CacheFile): Promise<void> {
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8")
}

// ---------------------------------------------------------------------------
// HTML stripper — shared by all fetch paths
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Direct fetch — used as primary path when BRIGHT_DATA_API_KEY is absent,
// and as fallback when Bright Data returns an error.
// Skips PDF/binary URLs (they can't be parsed as HTML).
// ---------------------------------------------------------------------------

const PDF_RE = /\.pdf(\?.*)?$/i

async function fetchDirect(url: string): Promise<string> {
  if (PDF_RE.test(url)) throw new Error("PDF URLs cannot be fetched as plain text — skipped")

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; GuardrailAI/1.0; +https://github.com/niti007/Guardrail-Agent)",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    },
    // 10-second timeout via AbortController
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) throw new Error(`Direct fetch ${response.status} ${response.statusText}`)
  const html = await response.text()
  return stripHtml(html)
}

// ---------------------------------------------------------------------------
// Bright Data Web Unlocker scraper
// Zone is read from BRIGHT_DATA_ZONE env var (defaults to "unlocker").
// Falls back to direct fetch if the API key is absent or the call fails.
// ---------------------------------------------------------------------------

async function scrapeUrl(url: string): Promise<string> {
  const apiKey = process.env.BRIGHT_DATA_API_KEY
  const zone   = process.env.BRIGHT_DATA_ZONE ?? "unlocker"

  // No API key → go straight to direct fetch
  if (!apiKey) return fetchDirect(url)

  try {
    const response = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ zone, url, format: "raw", country: "us" }),
    })

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText)
      // Fallback: treat any non-2xx as a soft error and try direct fetch
      console.warn(`[Guardrail] Bright Data ${response.status} for ${url}: ${err} — falling back to direct fetch`)
      return fetchDirect(url)
    }

    const html = await response.text()
    return stripHtml(html)
  } catch (bdErr) {
    console.warn(`[Guardrail] Bright Data threw for ${url}:`, bdErr, "— falling back to direct fetch")
    return fetchDirect(url)
  }
}

// ---------------------------------------------------------------------------
// GET /api/compliance-docs
// Returns the current knowledge base. If the cache is fresh (< 24 h) it is
// returned immediately; if stale the route re-scrapes all sources in parallel.
//
// Query params:
//   ?refresh=true   — force a full re-scrape even if cache is fresh
//   ?ids=soc2-overview,gdpr-art32   — only refresh specific source IDs
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const forceRefresh = searchParams.get("refresh") === "true"
  const idsParam = searchParams.get("ids")
  const filterIds = idsParam ? idsParam.split(",").map((s) => s.trim()) : null

  // 1. Try reading from cache
  const cached = await readCache()
  const now = Date.now()

  // Decide which sources need (re)scraping
  const sourcesToScrape = COMPLIANCE_SOURCES.filter((src) => {
    if (filterIds && !filterIds.includes(src.id)) return false
    if (forceRefresh) return true
    if (!cached) return true
    const doc = cached.docs[src.id]
    if (!doc) return true
    // Re-scrape if stale or previously errored
    if (doc.status === "error") return true
    return now - new Date(doc.scrapedAt).getTime() > DOCS_CACHE_TTL_MS
  })

  // If nothing needs scraping, return cached data
  if (sourcesToScrape.length === 0 && cached) {
    return NextResponse.json({
      fromCache: true,
      refreshedAt: cached.refreshedAt,
      docs: Object.values(cached.docs),
    })
  }

  // 2. Scrape all required sources in parallel (with concurrency cap of 4)
  const existing = cached?.docs ?? {}
  const updatedDocs: Record<string, StoredDoc> = { ...existing }

  const CONCURRENCY = 4
  for (let i = 0; i < sourcesToScrape.length; i += CONCURRENCY) {
    const batch = sourcesToScrape.slice(i, i + CONCURRENCY)

    await Promise.all(
      batch.map(async (src) => {
        try {
          const text = await scrapeUrl(src.url)
          updatedDocs[src.id] = {
            sourceId: src.id,
            framework: src.framework,
            label: src.label,
            url: src.url,
            text,
            charCount: text.length,
            snippet: text.slice(0, 400),
            scrapedAt: new Date().toISOString(),
            cacheVersion: SOURCES_CACHE_VERSION,
            status: "ok",
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          updatedDocs[src.id] = {
            sourceId: src.id,
            framework: src.framework,
            label: src.label,
            url: src.url,
            text: "",
            charCount: 0,
            snippet: "",
            scrapedAt: new Date().toISOString(),
            cacheVersion: SOURCES_CACHE_VERSION,
            status: "error",
            errorMessage: msg,
          }
        }
      })
    )
  }

  // 3. Persist updated cache
  const newCache: CacheFile = {
    version: SOURCES_CACHE_VERSION,
    refreshedAt: new Date().toISOString(),
    docs: updatedDocs,
  }
  await writeCache(newCache)

  const docs = Object.values(updatedDocs)
  const successCount = docs.filter((d) => d.status === "ok").length
  const errorCount = docs.filter((d) => d.status === "error").length

  return NextResponse.json({
    fromCache: false,
    refreshedAt: newCache.refreshedAt,
    scraped: sourcesToScrape.length,
    successCount,
    errorCount,
    docs,
  })
}

// ---------------------------------------------------------------------------
// POST /api/compliance-docs
// Trigger a full refresh of the entire knowledge base asynchronously.
// Returns immediately with a job receipt; callers should poll GET to see results.
// Body (optional): { ids: string[] }  — limit to specific source IDs
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { ids?: string[] }
  const ids = Array.isArray(body.ids) ? body.ids : null
  const idParam = ids ? `?ids=${ids.join(",")}` : "?refresh=true"

  // Fire-and-forget internal GET call so the POST returns immediately
  const baseUrl = req.nextUrl.origin
  fetch(`${baseUrl}/api/compliance-docs${idParam}&refresh=true`).catch(() => {})

  return NextResponse.json({
    message: "Compliance knowledge base refresh triggered.",
    sources: ids ?? COMPLIANCE_SOURCES.map((s) => s.id),
    totalSources: ids ? ids.length : COMPLIANCE_SOURCES.length,
  })
}
