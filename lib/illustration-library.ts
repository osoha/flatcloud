import type { CSSProperties } from "react";

export type IllustrationKind = "person" | "house" | "unit";
export const illustrationCount: Record<IllustrationKind, number> = { person: 48, house: 18, unit: 18 };

export function validIllustration(value: unknown, kind: IllustrationKind): value is string {
  return typeof value === "string" && new RegExp(`^library:${kind}:[1-9][0-9]*$`).test(value)
    && Number(value.split(":")[2]) <= illustrationCount[kind];
}

export function illustration(kind: IllustrationKind, index: number) {
  return `library:${kind}:${index + 1}`;
}

export function suggestedIllustration(kind: IllustrationKind, seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return illustration(kind, (hash >>> 0) % (kind === "person" ? 24 : illustrationCount[kind]));
}

// Keep each property's first 18 units distinct while preserving a stable choice across visits.
export function defaultPropertyIllustration(kind: "house" | "unit", propertyId: string, unitIndex = 0) {
  const first = Number(suggestedIllustration(kind, propertyId).split(":")[2]) - 1;
  return illustration(kind, (first + unitIndex) % illustrationCount[kind]);
}

export function illustrationStyle(value: string): CSSProperties {
  const [source, kind, raw] = value.split(":");
  const number = Number(raw);
  if (source !== "library" || !validIllustration(value, kind as IllustrationKind)) return {};
  if (kind !== "person" || number > 24) return {
    backgroundImage: `url(/illustrations/${kind}-${number}.webp)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
  const tile = number - 1;
  return {
    backgroundImage: "url(/illustrations/people.webp)",
    backgroundSize: "600% 400%",
    backgroundPosition: `${tile % 6 * 20}% ${Math.floor(tile / 6) * (100 / 3)}%`,
  };
}
