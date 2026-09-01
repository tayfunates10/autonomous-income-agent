export class NonceStore {
  readonly #consumed = new Set<string>();

  consume(nonce: string): void {
    const normalized = nonce.trim();
    if (normalized.length < 16) throw new Error("Approval nonce must contain at least 16 characters.");
    if (this.#consumed.has(normalized)) throw new Error("Approval nonce has already been consumed.");
    this.#consumed.add(normalized);
  }

  hasConsumed(nonce: string): boolean {
    return this.#consumed.has(nonce.trim());
  }

  get size(): number {
    return this.#consumed.size;
  }
}
