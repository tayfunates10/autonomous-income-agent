export interface BudgetEnvelope {
  budgetId: string;
  currency: string;
  limitMinor: number;
  startsAt: string;
  endsAt: string;
}

export interface BudgetReservation {
  actionId: string;
  budgetId: string;
  amountMinor: number;
  currency: string;
  reservedAt: string;
}

export class KillSwitch {
  #enabled = false;
  #reason = "";

  engage(reason: string): void {
    if (reason.trim().length === 0) throw new Error("Kill-switch reason cannot be empty.");
    this.#enabled = true;
    this.#reason = reason.trim();
  }

  release(): void {
    this.#enabled = false;
    this.#reason = "";
  }

  assertOperational(): void {
    if (this.#enabled) throw new Error(`Agent operations are disabled: ${this.#reason}`);
  }

  get engaged(): boolean {
    return this.#enabled;
  }
}

export class BudgetManager {
  readonly #envelopes = new Map<string, BudgetEnvelope>();
  readonly #reservations = new Map<string, BudgetReservation>();

  configure(envelope: BudgetEnvelope): void {
    if (envelope.budgetId.trim().length === 0) throw new Error("budgetId cannot be empty.");
    if (!/^[A-Z]{3}$/.test(envelope.currency)) throw new Error("Budget currency must be an uppercase three-letter code.");
    if (!Number.isSafeInteger(envelope.limitMinor) || envelope.limitMinor < 0) throw new Error("Budget limit must be a non-negative safe integer.");
    const startsAt = Date.parse(envelope.startsAt);
    const endsAt = Date.parse(envelope.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) throw new Error("Budget window is invalid.");
    this.#envelopes.set(envelope.budgetId, { ...envelope });
  }

  canSpend(budgetId: string, amountMinor: number, currency: string, now = new Date()): boolean {
    const envelope = this.#envelopes.get(budgetId);
    if (!envelope) return false;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return false;
    if (envelope.currency !== currency) return false;
    const current = now.getTime();
    if (current < Date.parse(envelope.startsAt) || current >= Date.parse(envelope.endsAt)) return false;
    return this.spentMinor(budgetId) + amountMinor <= envelope.limitMinor;
  }

  reserve(actionId: string, budgetId: string, amountMinor: number, currency: string, now = new Date()): BudgetReservation {
    if (actionId.trim().length === 0) throw new Error("actionId cannot be empty.");
    if (this.#reservations.has(actionId)) throw new Error("Budget reservation actionId has already been used.");
    if (!this.canSpend(budgetId, amountMinor, currency, now)) throw new Error("Spend is outside the configured budget envelope.");

    const reservation: BudgetReservation = {
      actionId,
      budgetId,
      amountMinor,
      currency,
      reservedAt: now.toISOString(),
    };
    this.#reservations.set(actionId, reservation);
    return { ...reservation };
  }

  spentMinor(budgetId: string): number {
    let total = 0;
    for (const reservation of this.#reservations.values()) {
      if (reservation.budgetId === budgetId) total += reservation.amountMinor;
    }
    return total;
  }
}
