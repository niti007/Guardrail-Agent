/**
 * TPRM Agent — Vendor & Third-Party Risk Management
 *
 * PHASE 2 PLACEHOLDER — not yet implemented.
 *
 * Planned behaviour:
 *   1. Accept a vendor name + website URL as input.
 *   2. Use Bright Data to scrape the vendor's public Trust Center / Security page.
 *   3. Check Mubit for any prior risk assessments on this vendor (persistent memory).
 *   4. Use the Vercel AI Gateway LLM to extract certification status (SOC 2, ISO 27001, etc.)
 *      and calculate a risk score.
 *   5. Write the result back to Mubit so future queries surface the historical score.
 *   6. Return a structured VendorRiskReport.
 *
 * Integrations required:
 *   - Bright Data Scraping Browser API  (BRIGHT_DATA_API_KEY)
 *   - Mubit SDK                         (MUBIT_API_URL, MUBIT_API_KEY)
 *   - Vercel AI Gateway                 (zero-config on Vercel)
 */

export interface VendorRiskInput {
  vendorName: string
  trustCenterUrl: string
  /** Optional: the team or person adding this vendor */
  requestedBy?: string
}

export interface VendorRiskReport {
  vendorName: string
  scannedAt: string
  certifications: string[]       // e.g. ["SOC 2 Type II", "ISO 27001"]
  riskScore: number              // 0–100, higher = riskier
  summary: string                // LLM-generated audit summary
  previousReview?: {
    scannedAt: string
    riskScore: number
    summary: string
  }
}

// TODO (Phase 2): implement runTPRMScan
export async function runTPRMScan(_input: VendorRiskInput): Promise<VendorRiskReport> {
  throw new Error("TPRM Agent is not yet implemented — planned for Phase 2.")
}
