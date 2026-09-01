import { authorizeExecution } from "../approval/gate.js";
import { appendAuditEvent, verifyAuditChain, type AuditEvent } from "../audit/hash-chain.js";
import type { PolicyResult } from "../policy/engine.js";
import { ExecutorRegistry, TransientExecutionError } from "./executor-registry.js";
import type { AgentTask, TaskRunOptions, TaskRunResult } from "./task.js";

export interface RuntimeSnapshot {
  version: 1;
  completedActionIds: readonly string[];
  audit: readonly AuditEvent[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateSnapshot(snapshot: RuntimeSnapshot): void {
  if (snapshot.version !== 1) throw new Error("Unsupported runtime snapshot version.");
  if (!verifyAuditChain(snapshot.audit)) throw new Error("Runtime snapshot audit chain is invalid.");
  const ids = new Set<string>();
  for (const actionId of snapshot.completedActionIds) {
    if (actionId.trim().length === 0) throw new Error("Runtime snapshot contains an empty actionId.");
    if (ids.has(actionId)) throw new Error("Runtime snapshot contains duplicate completed action IDs.");
    ids.add(actionId);
  }
}

export class AgentRuntime {
  readonly #registry: ExecutorRegistry;
  readonly #audit: AuditEvent[] = [];
  readonly #completedActionIds = new Set<string>();
  readonly #inFlightActionIds = new Set<string>();

  constructor(registry: ExecutorRegistry, snapshot?: RuntimeSnapshot) {
    this.#registry = registry;
    if (snapshot) {
      validateSnapshot(snapshot);
      this.#audit.push(...snapshot.audit.map((event) => ({ ...event })));
      for (const actionId of snapshot.completedActionIds) this.#completedActionIds.add(actionId);
    }
  }

  getAuditTrail(): readonly AuditEvent[] {
    return this.#audit.map((event) => ({ ...event }));
  }

  createSnapshot(): RuntimeSnapshot {
    return {
      version: 1,
      completedActionIds: [...this.#completedActionIds].sort(),
      audit: this.getAuditTrail(),
    };
  }

  #record(task: AgentTask, policy: PolicyResult, reason: string, approvalId?: string): void {
    const event = appendAuditEvent(this.#audit, {
      eventId: `${task.taskId}:event:${this.#audit.length + 1}`,
      actionId: task.actionId,
      timestamp: new Date().toISOString(),
      actor: "system",
      capability: task.capability,
      decision: policy.decision,
      reason,
      ...(approvalId === undefined ? {} : { approvalId }),
    });
    this.#audit.push(event);
  }

  async run<TOutput = unknown>(task: AgentTask, options: TaskRunOptions = {}): Promise<TaskRunResult<TOutput>> {
    if (this.#completedActionIds.has(task.actionId) || this.#inFlightActionIds.has(task.actionId)) {
      const policy: PolicyResult = {
        decision: "deny",
        reason: `Action ${task.actionId} was already executed or is currently in flight.`,
      };
      this.#record(task, policy, policy.reason);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "rejected_duplicate",
        attempts: 0,
        policy,
        audit: this.getAuditTrail(),
        error: policy.reason,
      };
    }

    const authorization = authorizeExecution({
      actionId: task.actionId,
      capability: task.capability,
      ...(task.approval === undefined ? {} : { approval: task.approval }),
      ...(task.channelAuthorized === undefined ? {} : { channelAuthorized: task.channelAuthorized }),
      ...(task.withinBudget === undefined ? {} : { withinBudget: task.withinBudget }),
      ...(options.now === undefined ? {} : { now: options.now }),
    });

    this.#record(task, authorization, authorization.reason, authorization.approvalId);

    if (authorization.decision === "deny") {
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "denied",
        attempts: 0,
        policy: authorization,
        audit: this.getAuditTrail(),
        error: authorization.reason,
      };
    }

    if (authorization.decision === "require_owner_approval") {
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "awaiting_approval",
        attempts: 0,
        policy: authorization,
        audit: this.getAuditTrail(),
      };
    }

    const executor = this.#registry.get(task.capability);
    if (!executor) {
      const error = `No executor registered for ${task.capability}.`;
      this.#record(task, authorization, error, authorization.approvalId);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "failed",
        attempts: 0,
        policy: authorization,
        audit: this.getAuditTrail(),
        error,
      };
    }

    if (options.signal?.aborted) {
      const error = "Task was cancelled before execution.";
      this.#record(task, authorization, error, authorization.approvalId);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "cancelled",
        attempts: 0,
        policy: authorization,
        audit: this.getAuditTrail(),
        error,
      };
    }

    const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 0));
    this.#inFlightActionIds.add(task.actionId);
    let attempts = 0;

    try {
      while (attempts <= maxRetries) {
        attempts += 1;
        try {
          const output = await executor(task.input, {
            taskId: task.taskId,
            actionId: task.actionId,
            attempt: attempts,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          });

          if (options.signal?.aborted) {
            const error = "Task was cancelled during execution.";
            this.#record(task, authorization, error, authorization.approvalId);
            return {
              taskId: task.taskId,
              actionId: task.actionId,
              status: "cancelled",
              attempts,
              policy: authorization,
              audit: this.getAuditTrail(),
              error,
            };
          }

          this.#completedActionIds.add(task.actionId);
          this.#record(task, authorization, `Execution succeeded after ${attempts} attempt(s).`, authorization.approvalId);
          return {
            taskId: task.taskId,
            actionId: task.actionId,
            status: "succeeded",
            attempts,
            policy: authorization,
            audit: this.getAuditTrail(),
            output: output as TOutput,
          };
        } catch (error) {
          if (options.signal?.aborted) {
            const message = "Task was cancelled during execution.";
            this.#record(task, authorization, message, authorization.approvalId);
            return {
              taskId: task.taskId,
              actionId: task.actionId,
              status: "cancelled",
              attempts,
              policy: authorization,
              audit: this.getAuditTrail(),
              error: message,
            };
          }

          if (error instanceof TransientExecutionError && attempts <= maxRetries) {
            continue;
          }

          const message = errorMessage(error);
          this.#record(task, authorization, `Execution failed: ${message}`, authorization.approvalId);
          return {
            taskId: task.taskId,
            actionId: task.actionId,
            status: "failed",
            attempts,
            policy: authorization,
            audit: this.getAuditTrail(),
            error: message,
          };
        }
      }

      throw new Error("Runtime retry loop exited unexpectedly.");
    } finally {
      this.#inFlightActionIds.delete(task.actionId);
    }
  }
}
