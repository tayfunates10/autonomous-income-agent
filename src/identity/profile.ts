export interface AgentIdentityProfile {
  agentId: string;
  displayName: string;
  ownerReference: string;
  disclosure: string;
  contactChannel?: string;
}

export function createAgentIdentityProfile(input: AgentIdentityProfile): AgentIdentityProfile {
  for (const [name, value] of Object.entries({
    agentId: input.agentId,
    displayName: input.displayName,
    ownerReference: input.ownerReference,
    disclosure: input.disclosure,
  })) {
    if (value.trim().length === 0) throw new Error(`${name} cannot be empty.`);
  }

  const disclosure = input.disclosure.trim();
  if (!/\b(ai|artificial intelligence|yapay zeka)\b/i.test(disclosure)) {
    throw new Error("Agent identity disclosure must explicitly state that it is AI.");
  }
  if (/\b(human|insanım|gerçek kişi)\b/i.test(disclosure) && !/not a human|insan değil/i.test(disclosure)) {
    throw new Error("Agent disclosure cannot present the agent as a human.");
  }

  return {
    agentId: input.agentId.trim(),
    displayName: input.displayName.trim(),
    ownerReference: input.ownerReference.trim(),
    disclosure,
    ...(input.contactChannel === undefined ? {} : { contactChannel: input.contactChannel.trim() }),
  };
}
