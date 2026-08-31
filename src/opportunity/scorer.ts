import type {
  OpportunityCandidate,
  OpportunityEvidence,
  OpportunityMetrics,
  OpportunityScore,
} from "./model.js";

function unit(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
  return value;
}

function validateMetrics(metrics: OpportunityMetrics): void {
  for (const [key, value] of Object.entries(metrics)) unit(value, `metrics.${key}`);
}

function evidenceQuality(evidence: readonly OpportunityEvidence[]): number {
  if (evidence.length === 0) return 0;

  let confidence = 0;
  const kinds = new Set<string>();
  const sources = new Set<string>();

  for (const item of evidence) {
    if (item.evidenceId.trim().length === 0 || item.sourceId.trim().length === 0 || item.summary.trim().length === 0) {
      throw new Error("Opportunity evidence requires evidenceId, sourceId and summary.");
    }
    unit(item.confidence, `evidence.${item.evidenceId}.confidence`);
    if (!Number.isFinite(Date.parse(item.observedAt))) {
      throw new Error(`evidence.${item.evidenceId}.observedAt must be a valid timestamp.`);
    }
    confidence += item.confidence;
    kinds.add(item.kind);
    sources.add(`${item.sourceType}:${item.sourceId}`);
  }

  const averageConfidence = confidence / evidence.length;
  const kindDiversity = Math.min(1, kinds.size / 3);
  const sourceDiversity = Math.min(1, sources.size / 3);
  return averageConfidence * (0.6 + 0.2 * kindDiversity + 0.2 * sourceDiversity);
}

export function scoreOpportunity(candidate: OpportunityCandidate): OpportunityScore {
  if (candidate.opportunityId.trim().length === 0) throw new Error("opportunityId cannot be empty.");
  if (candidate.title.trim().length === 0) throw new Error("Opportunity title cannot be empty.");
  validateMetrics(candidate.metrics);

  const quality = evidenceQuality(candidate.evidence);
  const reasons: string[] = [];

  if (candidate.evidence.length === 0) {
    return {
      opportunityId: candidate.opportunityId,
      score: 0,
      evidenceQuality: 0,
      decision: "discard",
      reasons: ["No evidence supplied; unsupported opportunities cannot be pursued."],
    };
  }

  if (candidate.metrics.legalRisk >= 0.8) {
    return {
      opportunityId: candidate.opportunityId,
      score: 0,
      evidenceQuality: quality,
      decision: "discard",
      reasons: ["Legal/compliance risk is above the configured hard ceiling."],
    };
  }

  if (candidate.metrics.platformRisk >= 0.9) {
    return {
      opportunityId: candidate.opportunityId,
      score: 0,
      evidenceQuality: quality,
      decision: "discard",
      reasons: ["Platform/account risk is above the configured hard ceiling."],
    };
  }

  const m = candidate.metrics;
  const base =
    m.demand * 0.22 +
    m.margin * 0.15 +
    m.automationFit * 0.15 +
    m.repeatability * 0.12 +
    m.speedToRevenue * 0.12 +
    m.differentiation * 0.12 +
    (1 - m.competition) * 0.05 +
    quality * 0.07;
  const riskPenalty = m.platformRisk * 0.15 + m.legalRisk * 0.25;
  const score = Math.max(0, Math.min(1, base - riskPenalty));

  reasons.push(`Evidence quality: ${quality.toFixed(3)}.`);
  reasons.push(`Risk-adjusted opportunity score: ${score.toFixed(3)}.`);

  if (score >= 0.72 && quality >= 0.6) {
    return { opportunityId: candidate.opportunityId, score, evidenceQuality: quality, decision: "pursue", reasons };
  }

  if (score >= 0.5) {
    reasons.push("More validation is required before committing build/sales resources.");
    return { opportunityId: candidate.opportunityId, score, evidenceQuality: quality, decision: "validate", reasons };
  }

  reasons.push("Risk-adjusted economics are below the pursuit threshold.");
  return { opportunityId: candidate.opportunityId, score, evidenceQuality: quality, decision: "discard", reasons };
}
