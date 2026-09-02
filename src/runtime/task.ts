import type { OwnerApprovalGrant } from "../approval/gate.js";
import type { AuditEvent } from "../audit/hash-chain.js";
import type { Capability } from "../policy/capabilities.js";
import type { PolicyResult } from "../policy/engine.js";

export type TaskStatus =
  | "awaiting_approval"
  | "cancelled"
  | "denied"
  | "failed"
  | "rejected_duplicate"
  | "succeeded"
  | "timed_out";

export interface AgentTask<TInput = unknown> {
  taskId: string;
  actionId: string;
  capability: Capability;
  input: TInput;
  approval?: OwnerApprovalGrant;
  channelAuthorized?: boolean;
  withinBudget?: boolean;
}

export interface TaskRunOptions {
  maxRetries?: number;
  signal?: AbortSignal;
  now?: Date;
  timeoutMs?: number;
}

export interface TaskRunResult<TOutput = unknown> {
  taskId: string;
  actionId: string;
  status: TaskStatus;
  attempts: number;
  policy: PolicyResult;
  audit: readonly AuditEvent[];
  output?: TOutput;
  error?: string;
}
