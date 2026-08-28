export type OperationalEvent<T extends string = string> = { status: T; effectiveAt: Date; createdAt?: Date };
export type OperationalStatusAt<T extends string = string> = { kind: "KNOWN"; status: T; event: OperationalEvent<T> } | { kind: "UNKNOWN_BEFORE_HISTORY" };
export function operationalStatusAt<T extends string>(events: OperationalEvent<T>[], asOf: Date): OperationalStatusAt<T> {
  const event = events.filter((item) => businessDateKey(item.effectiveAt) <= businessDateKey(asOf)).sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime() || (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))[0];
  return event ? { kind: "KNOWN", status: event.status, event } : { kind: "UNKNOWN_BEFORE_HISTORY" };
}
export function shouldCreateOperationalStatusEvent(previous: string, next: string) { return previous !== next; }
import { businessDateKey } from "./calendar";
