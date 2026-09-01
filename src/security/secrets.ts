export interface SecretRef {
  secretId: string;
  purpose: string;
}

export interface SecretProvider {
  resolve(ref: SecretRef): Promise<string>;
}

function validateSecretId(secretId: string): void {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(secretId)) {
    throw new Error("secretId must be an uppercase environment-safe identifier.");
  }
}

export class EnvironmentSecretProvider implements SecretProvider {
  readonly #prefix: string;

  constructor(prefix = "AIA_SECRET_") {
    if (!/^[A-Z][A-Z0-9_]*$/.test(prefix)) throw new Error("Secret environment prefix is invalid.");
    this.#prefix = prefix;
  }

  async resolve(ref: SecretRef): Promise<string> {
    validateSecretId(ref.secretId);
    if (ref.purpose.trim().length === 0) throw new Error("Secret purpose cannot be empty.");
    const value = process.env[`${this.#prefix}${ref.secretId}`];
    if (!value) throw new Error(`Required secret ${ref.secretId} is unavailable.`);
    return value;
  }
}

export function describeSecret(ref: SecretRef): string {
  validateSecretId(ref.secretId);
  if (ref.purpose.trim().length === 0) throw new Error("Secret purpose cannot be empty.");
  return `[secret:${ref.secretId};purpose:${ref.purpose.trim()}]`;
}
