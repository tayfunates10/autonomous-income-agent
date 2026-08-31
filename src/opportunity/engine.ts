import { MemoryStore } from "../memory/store.js";
import { buildPlan, type ExecutionPlan } from "../planner/plan.js";
import type { OpportunityCandidate, OpportunityScore } from "./model.js";
import { scoreOpportunity } from "./scorer.js";

export interface RankedOpportunity {
  candidate: OpportunityCandidate;
  assessment: OpportunityScore;
}

const DECISION_RANK = { pursue: 2, validate: 1, discard: 0 } as const;

export class OpportunityEngine {
  readonly #memory: MemoryStore;

  constructor(memory: MemoryStore = new MemoryStore()) {
    this.#memory = memory;
  }

  memory(): MemoryStore {
    return this.#memory;
  }

  assess(candidate: OpportunityCandidate): OpportunityScore {
    const assessment = scoreOpportunity(candidate);

    for (const evidence of candidate.evidence) {
      this.#memory.upsert({
        id: `opportunity:${candidate.opportunityId}:evidence:${evidence.evidenceId}`,
        text: evidence.summary,
        tags: ["opportunity", candidate.businessModel, evidence.kind, candidate.opportunityId],
        confidence: evidence.confidence,
        observedAt: evidence.observedAt,
        sensitivity: evidence.sourceType === "web" ? "public" : "internal",
        provenance: {
          sourceId: evidence.sourceId,
          sourceType: evidence.sourceType,
          ...(evidence.uri === undefined ? {} : { uri: evidence.uri }),
        },
      });
    }

    return assessment;
  }

  rank(candidates: readonly OpportunityCandidate[]): readonly RankedOpportunity[] {
    return candidates
      .map((candidate) => ({ candidate, assessment: this.assess(candidate) }))
      .sort(
        (a, b) =>
          DECISION_RANK[b.assessment.decision] - DECISION_RANK[a.assessment.decision] ||
          b.assessment.score - a.assessment.score ||
          a.candidate.opportunityId.localeCompare(b.candidate.opportunityId),
      );
  }

  createValidationPlan(candidate: OpportunityCandidate): ExecutionPlan {
    const prefix = `validate:${candidate.opportunityId}`;
    return buildPlan({
      planId: prefix,
      goal: `Validate opportunity: ${candidate.title}`,
      steps: [
        {
          stepId: "demand",
          actionId: `${prefix}:demand`,
          capability: "research.public_web",
          input: { opportunityId: candidate.opportunityId, question: "Find evidence of buyer demand and buyer intent." },
        },
        {
          stepId: "pricing",
          actionId: `${prefix}:pricing`,
          capability: "research.public_web",
          input: { opportunityId: candidate.opportunityId, question: "Find comparable prices and willingness-to-pay evidence." },
        },
        {
          stepId: "competition",
          actionId: `${prefix}:competition`,
          capability: "research.public_web",
          input: { opportunityId: candidate.opportunityId, question: "Measure direct/indirect competition and differentiation space." },
        },
        {
          stepId: "summary",
          actionId: `${prefix}:summary`,
          capability: "content.draft",
          input: { opportunityId: candidate.opportunityId, instruction: "Summarize validation evidence without inventing missing facts." },
          dependsOn: ["demand", "pricing", "competition"],
        },
      ],
    });
  }
}
