export type MemorySourceType = "execution" | "system" | "user" | "web";
export type MemorySensitivity = "internal" | "public";

export interface MemoryProvenance {
  sourceId: string;
  sourceType: MemorySourceType;
  uri?: string;
}

export interface MemoryEntry {
  id: string;
  text: string;
  tags: readonly string[];
  confidence: number;
  observedAt: string;
  expiresAt?: string;
  sensitivity: MemorySensitivity;
  provenance: MemoryProvenance;
}

export interface MemoryQuery {
  text?: string;
  tags?: readonly string[];
  sensitivity?: MemorySensitivity;
  now?: Date;
  limit?: number;
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid ISO timestamp.`);
  return parsed;
}

function validate(entry: MemoryEntry, now: Date): void {
  if (entry.id.trim().length === 0) throw new Error("Memory id cannot be empty.");
  if (entry.text.trim().length === 0) throw new Error("Memory text cannot be empty.");
  if (entry.provenance.sourceId.trim().length === 0) throw new Error("Memory provenance sourceId is required.");
  if (!Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
    throw new Error("Memory confidence must be between 0 and 1.");
  }

  const observedAt = timestamp(entry.observedAt, "observedAt");
  if (entry.expiresAt !== undefined) {
    const expiresAt = timestamp(entry.expiresAt, "expiresAt");
    if (expiresAt <= observedAt) throw new Error("Memory expiresAt must be later than observedAt.");
    if (expiresAt <= now.getTime()) throw new Error("Memory expiresAt must be in the future at insertion time.");
  }
}

function isExpired(entry: MemoryEntry, now: Date): boolean {
  return entry.expiresAt !== undefined && Date.parse(entry.expiresAt) <= now.getTime();
}

export class MemoryStore {
  readonly #entries = new Map<string, MemoryEntry>();

  upsert(entry: MemoryEntry, now: Date = new Date()): void {
    validate(entry, now);
    this.#entries.set(entry.id, {
      ...entry,
      text: entry.text.trim(),
      tags: [...new Set(entry.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
      provenance: { ...entry.provenance },
    });
  }

  get(id: string, now: Date = new Date()): MemoryEntry | undefined {
    const entry = this.#entries.get(id);
    if (!entry || isExpired(entry, now)) return undefined;
    return { ...entry, tags: [...entry.tags], provenance: { ...entry.provenance } };
  }

  query(query: MemoryQuery = {}): readonly MemoryEntry[] {
    const now = query.now ?? new Date();
    const wantedTags = new Set((query.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean));
    const needle = query.text?.trim().toLowerCase();
    const limit = Math.max(1, Math.floor(query.limit ?? 20));

    return [...this.#entries.values()]
      .filter((entry) => !isExpired(entry, now))
      .filter((entry) => query.sensitivity === undefined || entry.sensitivity === query.sensitivity)
      .filter((entry) => needle === undefined || entry.text.toLowerCase().includes(needle))
      .filter((entry) => wantedTags.size === 0 || [...wantedTags].every((tag) => entry.tags.includes(tag)))
      .sort((a, b) => b.confidence - a.confidence || Date.parse(b.observedAt) - Date.parse(a.observedAt))
      .slice(0, limit)
      .map((entry) => ({ ...entry, tags: [...entry.tags], provenance: { ...entry.provenance } }));
  }

  pruneExpired(now: Date = new Date()): number {
    let removed = 0;
    for (const [id, entry] of this.#entries) {
      if (isExpired(entry, now)) {
        this.#entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this.#entries.size;
  }
}
