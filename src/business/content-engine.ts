export type ContentSectionKind = "cta" | "editorial" | "evidence_claim";

export interface ContentSection {
  sectionId: string;
  kind: ContentSectionKind;
  text: string;
  evidenceIds?: readonly string[];
}

export interface ContentBrief {
  contentId: string;
  title: string;
  audience: string;
  availableEvidenceIds: readonly string[];
  sections: readonly ContentSection[];
}

export interface ContentDraft {
  contentId: string;
  title: string;
  audience: string;
  body: string;
  usedEvidenceIds: readonly string[];
  status: "draft";
}

export function createEvidenceGroundedContent(brief: ContentBrief): ContentDraft {
  if (brief.contentId.trim().length === 0) throw new Error("contentId cannot be empty.");
  if (brief.title.trim().length === 0) throw new Error("Content title cannot be empty.");
  if (brief.audience.trim().length === 0) throw new Error("Content audience cannot be empty.");
  if (brief.sections.length === 0) throw new Error("Content requires at least one section.");

  const available = new Set(brief.availableEvidenceIds);
  const sectionIds = new Set<string>();
  const usedEvidence = new Set<string>();
  const rendered: string[] = [];

  for (const section of brief.sections) {
    if (section.sectionId.trim().length === 0) throw new Error("Content sectionId cannot be empty.");
    if (sectionIds.has(section.sectionId)) throw new Error(`Duplicate content sectionId ${section.sectionId}.`);
    sectionIds.add(section.sectionId);
    if (section.text.trim().length === 0) throw new Error(`Content section ${section.sectionId} cannot be empty.`);

    const evidenceIds = [...(section.evidenceIds ?? [])];
    if (section.kind === "evidence_claim" && evidenceIds.length === 0) {
      throw new Error(`Evidence claim ${section.sectionId} requires at least one evidence ID.`);
    }

    for (const evidenceId of evidenceIds) {
      if (!available.has(evidenceId)) {
        throw new Error(`Section ${section.sectionId} references unavailable evidence ${evidenceId}.`);
      }
      usedEvidence.add(evidenceId);
    }

    rendered.push(section.text.trim());
  }

  return {
    contentId: brief.contentId,
    title: brief.title.trim(),
    audience: brief.audience.trim(),
    body: rendered.join("\n\n"),
    usedEvidenceIds: [...usedEvidence].sort(),
    status: "draft",
  };
}
