import type { Capability } from "../policy/capabilities.js";
import { evaluatePolicy, type PolicyResult } from "../policy/engine.js";

export interface PlanStepDraft {
  stepId: string;
  actionId: string;
  capability: Capability;
  input: unknown;
  dependsOn?: readonly string[];
  channelAuthorized?: boolean;
  withinBudget?: boolean;
}

export interface PlannedStep extends PlanStepDraft {
  dependsOn: readonly string[];
  policy: PolicyResult;
}

export interface ExecutionPlan {
  planId: string;
  goal: string;
  steps: readonly PlannedStep[];
}

export interface PlanDraft {
  planId: string;
  goal: string;
  steps: readonly PlanStepDraft[];
  maxSteps?: number;
}

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

function topologicalOrder(steps: readonly PlanStepDraft[]): readonly PlanStepDraft[] {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  if (byId.size !== steps.length) throw new PlanValidationError("Plan step IDs must be unique.");

  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const step of steps) {
    indegree.set(step.stepId, 0);
    outgoing.set(step.stepId, []);
  }

  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (dependency === step.stepId) throw new PlanValidationError(`Step ${step.stepId} cannot depend on itself.`);
      if (!byId.has(dependency)) {
        throw new PlanValidationError(`Step ${step.stepId} references missing dependency ${dependency}.`);
      }
      indegree.set(step.stepId, (indegree.get(step.stepId) ?? 0) + 1);
      outgoing.get(dependency)?.push(step.stepId);
    }
  }

  const ready = [...steps.filter((step) => indegree.get(step.stepId) === 0)].sort((a, b) =>
    a.stepId.localeCompare(b.stepId),
  );
  const ordered: PlanStepDraft[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    ordered.push(current);

    for (const nextId of outgoing.get(current.stepId) ?? []) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        const next = byId.get(nextId);
        if (next) {
          ready.push(next);
          ready.sort((a, b) => a.stepId.localeCompare(b.stepId));
        }
      }
    }
  }

  if (ordered.length !== steps.length) throw new PlanValidationError("Plan dependencies contain a cycle.");
  return ordered;
}

export function buildPlan(draft: PlanDraft): ExecutionPlan {
  const maxSteps = Math.max(1, Math.floor(draft.maxSteps ?? 50));
  if (draft.goal.trim().length === 0) throw new PlanValidationError("Plan goal cannot be empty.");
  if (draft.steps.length === 0) throw new PlanValidationError("Plan must contain at least one step.");
  if (draft.steps.length > maxSteps) {
    throw new PlanValidationError(`Plan contains ${draft.steps.length} steps; maximum is ${maxSteps}.`);
  }

  const actionIds = new Set(draft.steps.map((step) => step.actionId));
  if (actionIds.size !== draft.steps.length) throw new PlanValidationError("Plan action IDs must be unique.");

  const ordered = topologicalOrder(draft.steps);
  const steps = ordered.map<PlannedStep>((step) => ({
    ...step,
    dependsOn: [...(step.dependsOn ?? [])],
    policy: evaluatePolicy({
      capability: step.capability,
      ...(step.channelAuthorized === undefined ? {} : { channelAuthorized: step.channelAuthorized }),
      ...(step.withinBudget === undefined ? {} : { withinBudget: step.withinBudget }),
    }),
  }));

  return { planId: draft.planId, goal: draft.goal.trim(), steps };
}
