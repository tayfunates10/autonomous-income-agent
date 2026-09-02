import { authorizeExecution } from "../approval/gate.js";
import { appendAuditEvent, type AuditEvent } from "../audit/hash-chain.js";
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
        controller.abort(signal.reason);
        reject(new TaskCancelledError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    }

    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        controller.abort(new TaskTimeoutError(timeoutMs));
        reject(new TaskTimeoutError(timeoutMs));
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
}

export class AgentRuntime {
  readonly #registry: ExecutorRegistry;
  readonly #ownerAuthorizationVerifier: OwnerAuthorizationVerifier | undefined;
  readonly #killSwitch: AgentKillSwitch;
  readonly #audit: AuditEvent[] = [];
  readonly #completedActionIds = new Set<string>();
  readonly #inFlightActionIds = new Set<string>();

  constructor(registry: ExecutorRegistry, security: AgentRuntimeSecurityOptions = {}) {
    this.#registry = registry;
    this.#ownerAuthorizationVerifier = security.ownerAuthorizationVerifier;
    this.#killSwitch = security.killSwitch ?? new AgentKillSwitch();
  }

  getAuditTrail(): readonly AuditEvent[] {
    return [...this.#audit];
  }

  #record(task: AgentTask, policy: PolicyResult, reason: string, approvalId?: string, now?: Date): void {
    const event = appendAuditEvent(this.#audit, {
      eventId: `${task.taskId}:event:${this.#audit.length + 1}`,
      actionId: task.actionId,
      timestamp: (now ?? new Date()).toISOString(),
      actor: "system",
      capability: task.capability,
      decision: policy.decision,
      reason,
      ...(approvalId === undefined ? {} : { approvalId }),
    });
    this.#audit.push(event);
  }

  async run<TOutput = unknown>(task: AgentTask, options: TaskRunOptions = {}): Promise<TaskRunResult<TOutput>> {
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
      throw new Error("timeoutMs must be a positive safe integer when provided.");
    }

    try {
      this.#killSwitch.assertOperational();
    } catch (error) {
      const message = errorMessage(error);
      const policy: PolicyResult = { decision: "deny", reason: message };
      this.#record(task, policy, message, undefined, options.now);
      return {
        taskId: task.taskId,
        actionId: task.actionId,
        status: "denied",
        attempts: 0,
        policy,
        audit: this.getAuditTrail(),
        error: message,
      };
    }

    if (this.#completedActionIds.has(task.actionId) || this.#inFlightActionIds.has(task.actionId)) {
      const policy: PolicyResult = {
        decision: "deny",
        reason: `Action ${task.actionId} was already executed or is currently in flight.`,
      };
      this.#record(task, policy, policy.reason, undefined, options.now);
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
      ...(this.#ownerAuthorizationVerifier === undefined ? {} : { ownerAuthorizationVerifier: this.#ownerAuthorizationVerifier }),
      ...(task.channelAuthorized === undefined ? {} : { channelAuthorized: task.channelAuthorized }),
      ...(task.withinBudget === undefined ? {} : { withinBudget: task.withinBudget }),
      ...(options.now === undefined ? {} : { now: options.now }),
    });

    this.#record(task, authorization, authorization.reason, authorization.approvalId, options.now);

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
      this.#record(task, authorization, error, authorization.approvalId, options.now);
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
      this.#record(task, authorization, error, authorization.approvalId, options.now);
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
          const output = await executeWithControls(
            (signal) => executor(task.input, {
              taskId: task.taskId,
              actionId: task.actionId,
              attempt: attempts,
              signal,
            }) as Promise<TOutput>,
            options.signal,
            options.timeoutMs,
          );

          this.#completedActionIds.add(task.actionId);
          this.#record(task, authorization, `Execution succeeded after ${attempts} attempt(s).`, authorization.approvalId, options.now);
          return {
            taskId: task.taskId,
            actionId: task.actionId,
            status: "succeeded",
            attempts,
            policy: authorization,
            audit: this.getAuditTrail(),
            output,
          };
        } catch (error) {
          if (error instanceof TaskCancelledError || options.signal?.aborted) {
            const message = "Task was cancelled during execution.";
            this.#record(task, authorization, message, authorization.approvalId, options.now);
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

          if (error instanceof TaskTimeoutError) {
            const message = error.message;
            this.#record(task, authorization, message, authorization.approvalId, options.now);
            return {
              taskId: task.taskId,
              actionId: task.actionId,
              status: "timed_out",
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
          this.#record(task, authorization, `Execution failed: ${message}`, authorization.approvalId, options.now);
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
