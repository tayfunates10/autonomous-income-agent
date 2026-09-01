import type { Capability } from "../policy/capabilities.js";
import { sameOrigin, validatePublicHttpsUrl } from "./safe-url.js";

export interface AuthorizedChannel {
  channelId: string;
  displayName: string;
  origins: readonly string[];
  capabilities: readonly Capability[];
  enabled: boolean;
}

export class AuthorizedChannelRegistry {
  readonly #channels = new Map<string, AuthorizedChannel>();

  register(channel: AuthorizedChannel): void {
    if (channel.channelId.trim().length === 0) throw new Error("channelId cannot be empty.");
    if (channel.displayName.trim().length === 0) throw new Error("displayName cannot be empty.");
    if (channel.origins.length === 0) throw new Error("An authorized channel requires at least one origin.");
    if (channel.capabilities.length === 0) throw new Error("An authorized channel requires at least one capability.");

    const normalizedOrigins = channel.origins.map((origin) => validatePublicHttpsUrl(origin).origin);
    this.#channels.set(channel.channelId, {
      ...channel,
      origins: [...new Set(normalizedOrigins)],
      capabilities: [...new Set(channel.capabilities)],
    });
  }

  get(channelId: string): AuthorizedChannel | undefined {
    const value = this.#channels.get(channelId);
    return value ? { ...value, origins: [...value.origins], capabilities: [...value.capabilities] } : undefined;
  }

  isAuthorized(channelId: string | undefined, capability: Capability, target: URL): boolean {
    if (!channelId) return false;
    const channel = this.#channels.get(channelId);
    if (!channel?.enabled) return false;
    if (!channel.capabilities.includes(capability)) return false;
    return channel.origins.some((origin) => sameOrigin(origin, target));
  }
}
