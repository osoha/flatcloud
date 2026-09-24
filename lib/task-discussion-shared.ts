export const taskReactions = [
  { key: "LIKE", emoji: "👍", label: "Líbí se" },
  { key: "DISLIKE", emoji: "👎", label: "Nesouhlas" },
  { key: "LOVE", emoji: "❤️", label: "Srdce" },
  { key: "APPLAUSE", emoji: "👏", label: "Potlesk" },
  { key: "LAUGH", emoji: "😂", label: "Smích" },
  { key: "SAD", emoji: "😢", label: "Smutek" },
] as const;
export type Mention = { userId: string; label: string; start: number; end: number };
export type DiscussionPerson = { id: string; name: string; email: string; internal: boolean };
export function parseMentions(value: unknown, body: string): Mention[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error("Neplatný seznam zmínek.");
  let end = 0;
  return value.map(item => {
    if (!item || typeof item !== "object" || typeof item.userId !== "string" || typeof item.label !== "string" || !Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < end || item.end <= item.start || item.end > body.length || body.slice(item.start, item.end) !== `@${item.label}`) throw new Error("Zmínka se změnila. Vyberte osobu znovu z našeptávače.");
    end = item.end;
    return { userId: item.userId, label: item.label, start: item.start, end: item.end };
  });
}
export function updateMentionRanges(previous: string, next: string, mentions: Mention[]) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let oldEnd = previous.length, newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = newEnd - oldEnd;
  return mentions.flatMap(mention => mention.end <= start ? [mention] : mention.start >= oldEnd ? [{ ...mention, start: mention.start + delta, end: mention.end + delta }] : []);
}
export const notificationDefaults = { emailEnabled: true, mentions: true, assignments: true, comments: false, deadlines: true, statusChanges: false };
export const notificationFields = [
  ["emailEnabled", "E-mailová upozornění z úkolů a diskusí"],
  ["mentions", "Přímé @zmínky a adresná upozornění"],
  ["assignments", "Přiřazení úkolu"],
  ["comments", "Nové komentáře ve vláknech, kterých se účastním"],
  ["deadlines", "Blížící se a prošlé termíny mých úkolů"],
  ["statusChanges", "Změny stavu úkolů, kterých se účastním"],
] as const;
