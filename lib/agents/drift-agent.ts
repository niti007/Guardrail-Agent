/**
 * Drift Agent — Infrastructure Drift Correction
 *
 * PHASE 2 PLACEHOLDER — not yet implemented.
 *
 * Planned behaviour:
 *   1. Accept a cloud resource identifier (e.g. an AWS security group or S3 bucket).
 *   2. Fetch the live configuration from the cloud provider (via Bright Data or SDK).
 *   3. Fetch the declared configuration from the corresponding IaC file in GitHub.
 *   4. Use the Vercel AI Gateway LLM to diff the two states and classify the drift.
 *   5. Raise a structured DriftEvent and log it to Mubit.
 *   6. Return a decision prompt: "Revert live config" or "Update IaC to match".
 *
 * Integrations required:
 *   - Bright Data                  (live cloud config scraping / API calls)
 *   - GitHub API (Octokit)         (IaC source reading)
 *   - Mubit SDK                    (drift event audit trail)
 *   - Vercel AI Gateway            (change classification LLM)
 */

export interface DriftInput {
  /** Cloud provider: "aws" | "gcp" | "azure" */
  provider: string
  /** Human-readable resource identifier, e.g. "aws_lb.main security group" */
  resourceId: string
  /** GitHub path to the IaC file declaring this resource */
  iacFilePath: string
  iacRepo: { owner: string; repo: string }
}

export type DriftDecision = "revert_live" | "update_iac" | "no_drift"

export interface DriftEvent {
  resourceId: string
  detectedAt: string
  liveConfig: Record<string, unknown>
  declaredConfig: Record<string, unknown>
  diff: string                   // Human-readable diff summary from LLM
  decision: DriftDecision
  auditEventId?: string          // Mubit event ID
}

// TODO (Phase 2): implement runDriftCheck
export async function runDriftCheck(_input: DriftInput): Promise<DriftEvent> {
  throw new Error("Drift Agent is not yet implemented — planned for Phase 2.")
}
