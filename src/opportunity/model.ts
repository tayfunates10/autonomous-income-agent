export type BusinessModel =
  | "affiliate_content"
  | "api"
  | "digital_product"
  | "micro_saas"
  | "service";

export type EvidenceKind = "buyer_intent" | "competition" | "demand" | "price" | "problem" | "trend";

export interface OpportunityEvidence {
  evidenceId: string;
  sourceId: string;
  sourceType: "execution" | "user" | "web";
  kind: EvidenceKind;
  summary: string;
  confidence: number;
  observedAt: string;
  uri?: string;
}

export interface OpportunityMetrics {
  demand: number;
  margin: number;
  automationFit: number;
  repeatability: number;
  speedToRevenue: number;
  differentiation: number;
  competition: number;
  platformRisk: number;
  legalRisk: number;
}

export interface OpportunityCandidate {
  opportunityId: string;
  title: string;
  businessModel: BusinessModel;
  description: string;
  metrics: OpportunityMetrics;
  evidence: readonly OpportunityEvidence[];
}

export type OpportunityDecision = "discard" | "pursue" | "validate";

export interface OpportunityScore {
  opportunityId: string;
  score: number;
  evidenceQuality: number;
  decision: OpportunityDecision;
  reasons: readonly string[];
}
