export type LedgerEntryType = "cost" | "refund" | "revenue";

export interface LedgerEntry {
  entryId: string;
  type: LedgerEntryType;
  amountMinor: number;
  currency: string;
  category: string;
  sourceId: string;
  occurredAt: string;
}

export interface LedgerSummary {
  currency: string;
  grossRevenueMinor: number;
  refundsMinor: number;
  costsMinor: number;
  netMinor: number;
}

export interface AllocationPolicy {
  ownerShare: number;
  operationsShare: number;
  reinvestmentShare: number;
}

export interface NetAllocation {
  currency: string;
  ownerMinor: number;
  operationsMinor: number;
  reinvestmentMinor: number;
  deficitMinor: number;
}

function validateEntry(entry: LedgerEntry): void {
  if (entry.entryId.trim().length === 0) throw new Error("entryId cannot be empty.");
  if (entry.sourceId.trim().length === 0) throw new Error("sourceId cannot be empty.");
  if (entry.category.trim().length === 0) throw new Error("category cannot be empty.");
  if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
    throw new Error("amountMinor must be a positive safe integer.");
  }
  if (!/^[A-Z]{3}$/.test(entry.currency)) throw new Error("currency must be a three-letter uppercase code.");
  if (!Number.isFinite(Date.parse(entry.occurredAt))) throw new Error("occurredAt must be a valid timestamp.");
}

function validatePolicy(policy: AllocationPolicy): void {
  const shares = [policy.ownerShare, policy.operationsShare, policy.reinvestmentShare];
  if (shares.some((share) => !Number.isFinite(share) || share < 0 || share > 1)) {
    throw new Error("Allocation shares must be between 0 and 1.");
  }
  const total = shares.reduce((sum, share) => sum + share, 0);
  if (Math.abs(total - 1) > 1e-9) throw new Error("Allocation shares must sum to 1.");
}

function allocateInteger(total: number, shares: readonly number[]): number[] {
  const raw = shares.map((share) => total * share);
  const allocated = raw.map(Math.floor);
  let remainder = total - allocated.reduce((sum, value) => sum + value, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  let cursor = 0;
  while (remainder > 0) {
    const target = order[cursor % order.length];
    if (!target) break;
    allocated[target.index] = (allocated[target.index] ?? 0) + 1;
    remainder -= 1;
    cursor += 1;
  }

  return allocated;
}

export class RevenueLedger {
  readonly #entries = new Map<string, LedgerEntry>();

  add(entry: LedgerEntry): void {
    validateEntry(entry);
    if (this.#entries.has(entry.entryId)) throw new Error(`Ledger entry ${entry.entryId} already exists.`);
    this.#entries.set(entry.entryId, { ...entry });
  }

  entries(currency?: string): readonly LedgerEntry[] {
    return [...this.#entries.values()]
      .filter((entry) => currency === undefined || entry.currency === currency)
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.entryId.localeCompare(b.entryId))
      .map((entry) => ({ ...entry }));
  }

  summary(currency: string): LedgerSummary {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter uppercase code.");
    let grossRevenueMinor = 0;
    let refundsMinor = 0;
    let costsMinor = 0;

    for (const entry of this.#entries.values()) {
      if (entry.currency !== currency) continue;
      if (entry.type === "revenue") grossRevenueMinor += entry.amountMinor;
      if (entry.type === "refund") refundsMinor += entry.amountMinor;
      if (entry.type === "cost") costsMinor += entry.amountMinor;
    }

    return {
      currency,
      grossRevenueMinor,
      refundsMinor,
      costsMinor,
      netMinor: grossRevenueMinor - refundsMinor - costsMinor,
    };
  }

  allocateNet(currency: string, policy: AllocationPolicy): NetAllocation {
    validatePolicy(policy);
    const net = this.summary(currency).netMinor;

    if (net <= 0) {
      return {
        currency,
        ownerMinor: 0,
        operationsMinor: 0,
        reinvestmentMinor: 0,
        deficitMinor: Math.abs(net),
      };
    }

    const [ownerMinor = 0, operationsMinor = 0, reinvestmentMinor = 0] = allocateInteger(net, [
      policy.ownerShare,
      policy.operationsShare,
      policy.reinvestmentShare,
    ]);

    return { currency, ownerMinor, operationsMinor, reinvestmentMinor, deficitMinor: 0 };
  }
}

export const DEFAULT_ALLOCATION_POLICY: AllocationPolicy = {
  ownerShare: 0.8,
  operationsShare: 0.15,
  reinvestmentShare: 0.05,
};
