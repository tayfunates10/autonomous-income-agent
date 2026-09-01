export interface AgentIdentityProfile {
  agentId: string;
  displayName: string;
  kind: "authorized_ai_representative";
  ownerReference: string;
  disclosure: string;
  contactChannels: readonly string[];
}

export function createAgentIdentityProfile(input: AgentIdentityProfile): AgentIdentityProfile {
  if (input.agentId.trim().length === 0) throw new Error("agentId cannot be empty.");
  if (input.displayName.trim().length === 0) throw new Error("displayName cannot be empty.");
  if (input.ownerReference.trim().length === 0) throw new Error("ownerReference cannot be empty.");
  if (input.kind !== "authorized_ai_representative") throw new Error("Agent identity kind must disclose AI representation.");

  const disclosure = input.disclosure.trim();
  if (disclosure.length < 12 || !/\b(ai|artificial intelligence|yapay zek[aâ])\b/i.test(disclosure)) {
    throw new Error("Agent disclosure must clearly state that the representative is AI.");
  }

  const channels = input.contactChannels.map((channel) => channel.trim()).filter(Boolean);
  if (channels.length === 0) throw new Error("At least one contact channel is required.");

  return {
    agentId: input.agentId.trim(),
    displayName: input.displayName.trim(),
    kind: "authorized_ai_representative",
    ownerReference: input.ownerReference.trim(),
    disclosure,
    contactChannels: [...new Set(channels)],
  };
}
