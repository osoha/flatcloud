export const appearanceColors = { "": "Bez zvýraznění", blue: "Modrá", green: "Zelená", amber: "Písková", pink: "Růžová" } as const;
export const appearanceBackgrounds = { "": "transparent", blue: "var(--card-blue)", green: "var(--card-green)", amber: "var(--card-amber)", pink: "var(--card-pink)" };
export type AppearanceColor = keyof typeof appearanceColors;
export function entityAppearanceKey(propertyId: string, unitId?: string | null) { return unitId ? `unit:${unitId}` : `property:${propertyId}`; }
