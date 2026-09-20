export const appearanceColors = { "": "Bez zvýraznění", blue: "Modrá", green: "Zelená", amber: "Písková", pink: "Růžová" } as const;
export const appearanceBackgrounds = { "": "transparent", blue: "#eef4ff", green: "#eef8f3", amber: "#fff8e9", pink: "#fcf0f4" };
export type AppearanceColor = keyof typeof appearanceColors;
export function entityAppearanceKey(propertyId: string, unitId?: string | null) { return unitId ? `unit:${unitId}` : `property:${propertyId}`; }
