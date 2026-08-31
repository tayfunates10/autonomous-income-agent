export type EvaluationDecision = "accept" | "reject" | "revise";

export interface EvaluationCriterion {
  name: string;
  score: number;
  weight: number;
  hardMinimum?: number;
}

export interface EvaluationInput {
  criteria: readonly EvaluationCriterion[];
  acceptThreshold?: number;
  reviseThreshold?: number;
}

export interface EvaluationResult {
  decision: EvaluationDecision;
  weightedScore: number;
  failedHardMinimums: readonly string[];
  feedback: readonly string[];
}

function unitInterval(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
  return value;
}

export function evaluateOutcome(input: EvaluationInput): EvaluationResult {
  if (input.criteria.length === 0) throw new Error("At least one evaluation criterion is required.");

  const acceptThreshold = unitInterval(input.acceptThreshold ?? 0.8, "acceptThreshold");
  const reviseThreshold = unitInterval(input.reviseThreshold ?? 0.6, "reviseThreshold");
  if (reviseThreshold > acceptThreshold) {
    throw new Error("reviseThreshold cannot exceed acceptThreshold.");
  }

  let totalWeight = 0;
  let weightedTotal = 0;
  const failedHardMinimums: string[] = [];
  const feedback: string[] = [];

  for (const criterion of input.criteria) {
    if (criterion.name.trim().length === 0) throw new Error("Criterion name cannot be empty.");
    const score = unitInterval(criterion.score, `score:${criterion.name}`);
    if (!Number.isFinite(criterion.weight) || criterion.weight <= 0) {
      throw new Error(`weight:${criterion.name} must be greater than zero.`);
    }

    totalWeight += criterion.weight;
    weightedTotal += score * criterion.weight;

    if (criterion.hardMinimum !== undefined) {
      const minimum = unitInterval(criterion.hardMinimum, `hardMinimum:${criterion.name}`);
      if (score < minimum) {
        failedHardMinimums.push(criterion.name);
        feedback.push(`${criterion.name} scored ${score.toFixed(3)} below hard minimum ${minimum.toFixed(3)}.`);
      }
    }
  }

  const weightedScore = weightedTotal / totalWeight;

  if (failedHardMinimums.length > 0) {
    return { decision: "reject", weightedScore, failedHardMinimums, feedback };
  }

  if (weightedScore >= acceptThreshold) {
    return {
      decision: "accept",
      weightedScore,
      failedHardMinimums,
      feedback: [`Weighted score ${weightedScore.toFixed(3)} meets acceptance threshold ${acceptThreshold.toFixed(3)}.`],
    };
  }

  if (weightedScore >= reviseThreshold) {
    return {
      decision: "revise",
      weightedScore,
      failedHardMinimums,
      feedback: [`Weighted score ${weightedScore.toFixed(3)} requires revision before acceptance.`],
    };
  }

  return {
    decision: "reject",
    weightedScore,
    failedHardMinimums,
    feedback: [`Weighted score ${weightedScore.toFixed(3)} is below revision threshold ${reviseThreshold.toFixed(3)}.`],
  };
}
