import type { CSSProperties } from "react";

export type IllustrationKind = "person" | "house" | "unit";
export const illustrationCount: Record<IllustrationKind, number> = { person: 24, house: 12, unit: 12 };

export function validIllustration(value: unknown, kind: IllustrationKind): value is string {
  return typeof value === "string" && new RegExp(`^library:${kind}:(?:[1-9]|1[0-9]|2[0-4])$`).test(value)
    && Number(value.split(":")[2]) <= illustrationCount[kind];
}

export function illustration(kind: IllustrationKind, index: number) {
  return `library:${kind}:${index + 1}`;
}

export function suggestedIllustration(kind: IllustrationKind, seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return illustration(kind, (hash >>> 0) % illustrationCount[kind]);
}

export function illustrationStyle(value: string): CSSProperties {
  const [source, kind, raw] = value.split(":");
  const number = Number(raw);
  if (source !== "library" || !validIllustration(value, kind as IllustrationKind)) return {};
  const tile = kind === "person" ? number - 1 : kind === "house" ? number - 1 : number + 11;
  return {
    backgroundImage: `url(/illustrations/${kind === "person" ? "people" : "places"}.webp)`,
    backgroundSize: "600% 400%",
    backgroundPosition: `${tile % 6 * 20}% ${Math.floor(tile / 6) * (100 / 3)}%`,
  };
}
