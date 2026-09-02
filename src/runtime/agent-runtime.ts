import { authorizeExecution } from "../approval/gate.js";
import {
  appendAuditEvent,
  type AuditAnchor,
  type AuditEvent,
  type AuditWindow,
} from "../audit/hash-chain.js";
import type { PolicyResult } from "../policy/engine.js";
import { AgentKillSwitch } from "../security/controls.js";
import type { OwnerAuthorizationVerifier } from "../security/owner-authorization.js";
import { ExecutorRegistry, TransientExecutionError } from "./executor-registry.js";
import type { AgentTask, TaskRunOptions, TaskRunResult } from "./task.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? String(error.message) : String(error);
}

class TaskCancelledError extends Error {
  constructor() {
    super("Task was cancelled during execution.");
    this.name = "TaskCancelledError";
  }
}

class TaskTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Task execution timed out after ${timeoutMs} ms.`);
    this.name = "TaskTimeoutError";
  }
}

async function executeWithControls<T>(
  executor: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): Promise<T> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  let removeAbortListener: (() => void) | undefined;

  const controls = new Promise<never>((_, reject) => {
    if (signal) {
      const onAbort = () => {
        reject(new TaskCancelledError());
        controller.abort(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    }

    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        const error = new TaskTimeoutError(timeoutMs);
        reject(error);
        controller.abort(error);
      }, timeoutMs);
    }
  });

  try {
    if (signal?.aborted) throw new TaskCancelledError();
    return await Promise.race([executor(controller.signal), controls]);
  } finally {
    if (timeout) clearTimeout(timeout);
    removeAbortListener?.();
  }
}

export interface AgentRuntimeSecurityOptions {
  ownerAuthorizationVerifier?: OwnerAuthorizationVerifier;
  killSwitch?: AgentKillSwitch;
  maxRetainedAuditEvents?: number;
}

export class AgentRuntime {
  readonly #registry: ExecutorRegistry;
  readonly #ownerAuthorizationVerifier: OwnerAuthorizationVerifier | undefined;
  readonly #killSwitch: AgentKillSwitch;
  readonly #maxRetainedAuditEvents: number;
  readonly #audit: AuditEvent[] = [];
  #auditBase: AuditAnchor = { eventCount: 0, tailHash: "GENESIS" };
  readonly #completedActionIds = new Set<string>();
  readonly #inFlightActionIds = new Set<string>();

  constructor(registry: ExecutorRegistry, security: AgentRuntimeSecurityOptions = {}) {
    this.#registry = registry;
    this.#ownerAuthorizationVerifier = security.ownerAuthorizationVerifier;
    this.#killSwitch = security.killSwitch ?? new AgentKillSwitch();
    const retention = security.maxRetainedAuditEvents ?? 10_000;
    if (!Number.isSafeInteger(retention) || retention < 1) {
      throw new Error("maxRetainedAuditEvents must be a positive safe integer.");
    }
    this.#maxRetainedAuditEvents = retention;
  }

  getAuditTrail(): readonly AuditEvent[] {
    return this.#audit.map((event) => ({ ...event }));
  }

  getAuditWindow(): AuditWindow {
    const events = this.getAuditTrail();
    return {
      base: { ...this.#auditBase },
      head: {
        eventCount: this.#auditBase.eventCount + events.length,
        tailHash: events.at(-1)?.hash ?? this.#auditBase.tailHash,
      },
      events,
    };
  }

  pruneAuditTrail(retainLast = 0): AuditAnchor {
    if (!Number.isSafeInteger(retainLast) || retainLast < 0) {
      throw new Error("retainLast must be a non-negative safe integer.");
    }
    const removeCount = Math.max(0, this.#audit.length - retainLast);
    if (removeCount === 0) return { ...this.#auditBase };
    const removed = this.#audit.splice(0, removeCount);
    this.#auditBase = {
      eventCount: this.#auditBase.eventCount + removed.length,
      tailHash: removed.at(-1)!.hash,
    };
    return { ...this.#auditBase };
  }

  #compactAudit(): void {
    const overflow = this.#audit.length - this.#maxRetainedAuditEvents;
    if (overflow <= 0) return;
    const removed = this.#audit.splice(0, overflow);
    this.#auditBase = {
      eventCount: this.#auditBase.eventCount + removed.length,
      tailHash: removed.at(-1)!.hash,
    };
  }

  #runAudit(events: readonly AuditEvent[]): readonly AuditEvent[] {
    return events.map((event) => ({ ...event }));
  }

  #record(
    task: AgentTask,
    policy: PolicyResult,
    reason: string,
    approvalId: string | undefined,
    now: Date | undefined,
    runAudit: AuditEvent[],
  ): void {
    const eventNumber = this.#auditBase.eventCount + this.#audit.length + 1;
    const event = appendAuditEvent(this.#audit, {
      eventId: `${task.taskId}:event:${eventNumber}`,
      actionId: task.actionId,
      timestamp: (now ?? new Date()).toISOString(),
      actor: "system",
      capability: task.capability,
      decision: policy.decision,
      reason,
      ...(approvalId === undefined ? {} : { approvalId }),
    }, this.#auditBase.tailHash);
    this.#audit.push(event);
    runAudit.push({ ...event });
    this.#compactAudit();
  }

  async run<TOutput = unknown>(task: AgentTask, options: TaskRunOptions = {}): Promise<TaskRunResult<TOutput>> {
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
      throw new Error("timeoutMs must be a positive safe integer when provided.");
    }
    const runAudit: AuditEvent[] = [];

    try {
      this.#killSwitch.assertOperational();
    } catch (error) {
      const message = errorMessage(error);
      const policy: PolicyResult = { decision: "deny", reason: message };
      this.#record(task, policy, message, undefined, options.now, runAudit);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "denied",
        attempts: 0,
        policy,
        audit: this.#runAudit(runAudit),
        error: message,
      };
    }

    if (this.#completedActionIds.has(task.actionId) || this.#inFlightActionIds.has(task.actionId)) {
      const policy: PolicyResult = {
        decision: "deny",
        reason: `Action ${task.actionId} was already executed or is currently in flight.`,
      };
      this.#record(task, policy, policy.reason, undefined, options.now, runAudit);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "rejected_duplicate",
        attempts: 0,
        policy,
        audit: this.#runAudit(runAudit),
        error: policy.reason,
      };
    }

    const authorization = authorizeExecution({
      actionId: task.actionId,
      capability: task.capability,
      ...(task.approval === undefined ? {} : { approval: task.approval }),
      ...(this.#ownerAuthorizationVerifier === undefined ? {} : { ownerAuthorizationVerifier: this.#ownerAuthorizationVerifier }),
      ...(task.channelAuthorized === undefined ? {} : { channelAuthorized: task.channelAuthorized }),
      ...(task.withinBudget === undefined ? {} : { withinBudget: task.withinBudget }),
      ...(options.now === undefined ? {} : { now: options.now }),
    });

    this.#record(task, authorization, authorization.reason, authorization.approvalId, options.now, runAudit);

    if (authorization.decision === "deny") {
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "denied",
        attempts: 0,
        policy: authorization,
        audit: this.#runAudit(runAudit),
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
        audit: this.#runAudit(runAudit),
      };
    }

    const executor = this.#registry.get(task.capability);
    if (!executor) {
      const error = `No executor registered for ${task.capability}.`;
      this.#record(task, authorization, error, authorization.approvalId, options.now, runAudit);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "failed",
        attempts: 0,
        policy: authorization,
        audit: this.#runAudit(runAudit),
        error,
      };
    }

    if (options.signal?.aborted) {
      const error = "Task was cancelled before execution.";
      this.#record(task, authorization, error, authorization.approvalId, options.now, runAudit);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "cancelled",
        attempts: 0,
        policy: authorization,
        audit: this.#runAudit(runAudit),
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
          const output = await executeWithControls(
            (signal) => executor(structuredClone(task.input), {
              taskId: task.taskId,
              actionId: task.actionId,
              attempt: attempts,
              signal,
            }) as Promise<TOutput>,
            options.signal,
            options.timeoutMs,
          );

          this.#completedActionIds.add(task.actionId);
          this.#record(task, authorization, `Execution succeeded after ${attempts} attempt(s).`, authorization.approvalId, options.now, runAudit);
          return {
            taskId: task.taskId,
            actionId: task.actionId,
            status: "succeeded",
            attempts,
            policy: authorization,
            audit: this.#runAudit(runAudit),
            output,
          };
        } catch (error) {
          if (error instanceof TaskCancelledError || options.signal?.aborted) {
            const message = "Task was cancelled during execution.";
            this.#record(task, authorization, message, authorization.approvalId, options.now, runAudit);
            return {
              taskId: task.taskId,
              actionId: task.actionId,
              status: "cancelled",
              attempts,
              policy: authorization,
              audit: this.#runAudit(runAudit),
              error: message,
            };
          }

          if (error instanceof TaskTimeoutError) {
            const message = error.message;
            this.#record(task, authorization, message, authorization.approvalId, options.now, runAudit);
            return {
              taskId: task.taskId,
              actionId: task.actionId,
              status: "timed_out",
              attempts,
              policy: authorization,
              audit: this.#runAudit(runAudit),
              error: message,
            };
          }

          if (error instanceof TransientExecutionError && attempts <= maxRetries) {
            continue;
          }

          const message = errorMessage(error);
          this.#record(task, authorization, `Execution failed: ${message}`, authorization.approvalId, options.now, runAudit);
          return {
            taskId: task.taskId,
            actionId: task.actionId,
            status: "failed",
            attempts,
            policy: authorization,
            audit: this.#runAudit(runAudit),
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
