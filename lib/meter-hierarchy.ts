export type MeterHierarchyNode = {
  id: string; propertyId: string; unitId?: string | null;
  scope: "UNIT" | "HOUSE_MAIN" | "HOUSE_SUBMETER"; parentId?: string | null;
  replacementOfId?: string | null; type: string; unitOfMeasure: string;
  installedAt?: Date | null; removedAt?: Date | null;
};
export function validateMeterHierarchy(candidate: MeterHierarchyNode, existing: MeterHierarchyNode[]) {
  if (candidate.scope === "UNIT" && !candidate.unitId) throw new Error("Bytové měřidlo musí být přiřazeno jednotce.");
  if (candidate.scope !== "UNIT" && candidate.unitId) throw new Error("Domovní měřidlo nesmí být přiřazeno bytové jednotce.");
  if (candidate.scope === "HOUSE_MAIN" && candidate.parentId) throw new Error("Hlavní domovní měřidlo nemůže mít nadřazené měřidlo.");
  if (candidate.parentId === candidate.id) throw new Error("Měřidlo nemůže být nadřazené samo sobě.");
  const byId = new Map(existing.map((meter) => [meter.id, meter]));
  if (candidate.parentId) {
    const parent = byId.get(candidate.parentId);
    if (!parent) throw new Error("Nadřazené měřidlo nebylo nalezeno.");
    if (parent.propertyId !== candidate.propertyId) throw new Error("Hierarchie měřidel nesmí překročit hranici nemovitosti.");
    if (parent.type !== candidate.type) throw new Error("Nadřazené a podružné měřidlo musí měřit stejné médium.");
    if (parent.unitOfMeasure !== candidate.unitOfMeasure) throw new Error("Nadřazené a podružné měřidlo musí používat stejnou měrnou jednotku.");
    const visited = new Set([candidate.id]);
    let cursor: MeterHierarchyNode | undefined = parent;
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error("Hierarchie měřidel obsahuje cyklus.");
      visited.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
  if (candidate.replacementOfId) {
    const previous = byId.get(candidate.replacementOfId);
    if (!previous) throw new Error("Nahrazované měřidlo nebylo nalezeno.");
    if (previous.propertyId !== candidate.propertyId || previous.unitId !== candidate.unitId || previous.type !== candidate.type) throw new Error("Výměna musí navazovat na stejné místo a médium.");
    if (candidate.installedAt && previous.removedAt && candidate.installedAt < previous.removedAt) throw new Error("Nové měřidlo nemůže být osazeno před vyřazením předchozího.");
  }
}
