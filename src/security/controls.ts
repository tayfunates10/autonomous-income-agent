export class AgentKillSwitch {
  #engaged = false;
  #reason: string | null = null;

  engage(reason: string): void {
    if (reason.trim().length === 0) throw new Error("Kill-switch reason cannot be empty.");
    this.#engaged = true;
    this.#reason = reason.trim();
  }

  release(): void {
    this.#engaged = false;
    this.#reason = null;
  }

  assertOperational(): void {
    if (this.#engaged) throw new Error(`Agent is disabled by owner kill-switch: ${this.#reason ?? "unspecified"}`);
  }

  get engaged(): boolean {
    return this.#engaged;
  }
}

export interface SecretReference {
  provider: "environment" | "vault" | "cloud_secret_manager";
  name: string;
}

function looksLikeInlineCredential(value: string): boolean {
  return (
    value.includes("=") ||
    /[\r\n\t]/.test(value) ||
    /^\s*(?:bearer\s+)/i.test(value) ||
    /^(?:sk-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{12,}|gh[pousr]_[A-Za-z0-9_]{20,})$/.test(value)
  );
}

export function validateSecretReference(reference: SecretReference): SecretReference {
  const name = reference.name.trim();
  if (name.length === 0) throw new Error("Secret reference name cannot be empty.");
  if (looksLikeInlineCredential(name)) {
    throw new Error("Secret reference must be an identifier, never an inline credential.");
  }

  if (reference.provider === "environment") {
    if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(name)) {
      throw new Error("Environment secret reference must be an uppercase environment variable identifier.");
    }
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/.test(name)) {
    throw new Error("Vault/cloud secret reference contains unsupported characters.");
  }

  return { provider: reference.provider, name };
}

export class SpendBudgetGuard {
  readonly #limitMinor: number;
  #reservedMinor = 0;

  constructor(limitMinor: number) {
    if (!Number.isSafeInteger(limitMinor) || limitMinor < 0) throw new Error("Budget limit must be a non-negative safe integer.");
    this.#limitMinor = limitMinor;
  }

  reserve(amountMinor: number): boolean {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Spend amount must be a positive safe integer.");
    if (this.#reservedMinor + amountMinor > this.#limitMinor) return false;
    this.#reservedMinor += amountMinor;
    return true;
  }

  release(amountMinor: number): void {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > this.#reservedMinor) {
      throw new Error("Invalid budget release amount.");
    }
    this.#reservedMinor -= amountMinor;
  }

  get remainingMinor(): number {
    return this.#limitMinor - this.#reservedMinor;
  }
}
