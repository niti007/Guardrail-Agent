// ---------------------------------------------------------------------------
// Guardrail AI — Compliance Knowledge Sources
// A curated list of authoritative compliance documentation URLs scraped by
// Bright Data to enrich the LLM policy analysis context.
// ---------------------------------------------------------------------------

export type ComplianceFramework =
  | "SOC 2"
  | "GDPR"
  | "HIPAA"
  | "ISO 27001"
  | "PCI-DSS"
  | "NIST CSF"

export interface ComplianceSource {
  id: string
  framework: ComplianceFramework
  label: string
  url: string
  /** Short description shown in the UI */
  description: string
  /** Which policy rule codes this source is most relevant to */
  relatedRules: string[]
}

export const COMPLIANCE_SOURCES: ComplianceSource[] = [
  // ---- SOC 2 ---------------------------------------------------------------
  {
    id: "soc2-trust-criteria",
    framework: "SOC 2",
    label: "SOC 2 Trust Services Criteria",
    url: "https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/sorhome",
    description: "AICPA SOC for Service Organizations home — Trust Services Criteria covering CC6, A1, and PI categories.",
    relatedRules: ["SOC2-CC6.3", "SOC2-CC6.7", "SOC2-A1.2"],
  },
  {
    id: "soc2-overview",
    framework: "SOC 2",
    label: "SOC 2 Reporting Overview",
    url: "https://www.aicpa-cima.com/resources/landing/soc-2-reporting-on-an-examination-of-controls-at-a-service-organization-relevant-to-security-availability-processing-integrity-confidentiality-or-privacy",
    description: "AICPA SOC 2 landing page covering security, availability, processing integrity, confidentiality, and privacy principles.",
    relatedRules: ["SOC2-CC6.3", "SOC2-CC6.7", "SOC2-A1.2"],
  },

  // ---- GDPR ----------------------------------------------------------------
  {
    id: "gdpr-art32",
    framework: "GDPR",
    label: "GDPR Article 32 — Security of Processing",
    url: "https://gdpr-info.eu/art-32-gdpr/",
    description: "Full text of GDPR Article 32 requiring appropriate technical measures including encryption and confidentiality of personal data.",
    relatedRules: ["GDPR-32.1", "GDPR-32.2"],
  },
  {
    id: "gdpr-full-text",
    framework: "GDPR",
    label: "GDPR Full Regulation Text",
    url: "https://gdpr-info.eu/",
    description: "Complete GDPR regulation text — all articles and recitals covering data protection obligations.",
    relatedRules: ["GDPR-32.1", "GDPR-32.2"],
  },
  {
    id: "gdpr-guidelines-encryption",
    framework: "GDPR",
    label: "EDPB Guidelines on Encryption",
    url: "https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-022021-virtual-voice-assistants_en",
    description: "European Data Protection Board guidance on encryption and technical safeguards for personal data.",
    relatedRules: ["GDPR-32.1"],
  },

  // ---- HIPAA ---------------------------------------------------------------
  {
    id: "hipaa-security-rule",
    framework: "HIPAA",
    label: "HIPAA Security Rule Summary",
    url: "https://en.wikipedia.org/wiki/Health_Insurance_Portability_and_Accountability_Act",
    description: "Comprehensive overview of HIPAA Security Rule — administrative, physical, and technical safeguards for electronic protected health information.",
    relatedRules: ["GDPR-32.1", "SOC2-CC6.3"],
  },
  {
    id: "hipaa-guidance-cloud",
    framework: "HIPAA",
    label: "HIPAA Cloud Computing Guidance",
    url: "https://www.ama-assn.org/practice-management/hipaa/hipaa-security-rule-risk-analysis",
    description: "AMA overview of HIPAA Security Rule risk analysis requirements covering encryption, access controls, and safeguards.",
    relatedRules: ["GDPR-32.1", "SOC2-CC6.7"],
  },

  // ---- ISO 27001 -----------------------------------------------------------
  {
    id: "iso27001-overview",
    framework: "ISO 27001",
    label: "ISO/IEC 27001 Information Security Management",
    url: "https://www.iso.org/standard/27001",
    description: "ISO 27001:2022 international standard for information security management systems (ISMS).",
    relatedRules: ["SOC2-CC6.3", "SOC2-CC6.7", "GDPR-32.1"],
  },
  {
    id: "iso27001-controls",
    framework: "ISO 27001",
    label: "ISO 27002 Security Controls",
    url: "https://www.iso.org/standard/75652.html",
    description: "ISO 27002:2022 guidance on information security controls — Annex A reference controls.",
    relatedRules: ["SOC2-CC6.3", "SOC2-CC6.7"],
  },

  // ---- PCI-DSS -------------------------------------------------------------
  {
    id: "pcidss-v4",
    framework: "PCI-DSS",
    label: "PCI DSS v4.0 Requirements",
    url: "https://www.pcisecuritystandards.org/document_library/",
    description: "PCI Security Standards Council — PCI DSS v4.0 requirements for cardholder data environments.",
    relatedRules: ["GDPR-32.1", "GDPR-32.2", "SOC2-CC6.3"],
  },
  {
    id: "pcidss-cloud",
    framework: "PCI-DSS",
    label: "PCI DSS Cloud Computing Guidelines",
    url: "https://en.wikipedia.org/wiki/Payment_Card_Industry_Data_Security_Standard",
    description: "Comprehensive overview of PCI DSS requirements covering cardholder data environments, encryption, access controls, and network segmentation.",
    relatedRules: ["GDPR-32.2", "SOC2-CC6.7"],
  },

  // ---- NIST CSF ------------------------------------------------------------
  {
    id: "nist-csf-2",
    framework: "NIST CSF",
    label: "NIST Cybersecurity Framework 2.0",
    url: "https://www.nist.gov/cyberframework",
    description: "NIST CSF 2.0 — Identify, Protect, Detect, Respond, Recover functions for cybersecurity risk management.",
    relatedRules: ["SOC2-CC6.3", "SOC2-CC6.7", "SOC2-A1.2"],
  },
  {
    id: "nist-sp800-53",
    framework: "NIST CSF",
    label: "NIST SP 800-53 Security Controls",
    url: "https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final",
    description: "NIST SP 800-53 Rev 5 — Security and privacy controls catalogue for federal information systems.",
    relatedRules: ["SOC2-CC6.3", "SOC2-CC6.7", "GDPR-32.1"],
  },
]

// Grouped by framework for quick lookup
export const SOURCES_BY_FRAMEWORK: Record<ComplianceFramework, ComplianceSource[]> =
  COMPLIANCE_SOURCES.reduce(
    (acc, src) => {
      if (!acc[src.framework]) acc[src.framework] = []
      acc[src.framework].push(src)
      return acc
    },
    {} as Record<ComplianceFramework, ComplianceSource[]>
  )

// The CACHE_VERSION is bumped whenever the source list changes so that stale
// cached files are automatically invalidated on next startup.
export const SOURCES_CACHE_VERSION = "v3"

// Cache TTL for stored documents — 24 hours in milliseconds
export const DOCS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
