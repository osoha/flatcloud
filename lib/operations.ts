import type { ComplianceItem, TaskStatus } from "@prisma/client";

export const openTaskStatuses: TaskStatus[] = ["OPEN", "IN_PROGRESS", "WAITING"];

export function complianceState(item: Pick<ComplianceItem, "nextDueAt" | "active">, now = new Date()) {
  if (!item.active) return { key: "inactive", label: "Neaktivní", tone: "" } as const;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.nextDueAt);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { key: "overdue", label: `Po termínu ${Math.abs(days)} dní`, tone: "bad", days } as const;
  if (days === 0) return { key: "today", label: "Termín dnes", tone: "bad", days } as const;
  if (days <= 30) return { key: "soon", label: `Za ${days} dní`, tone: "warn", days } as const;
  if (days <= 60) return { key: "upcoming", label: `Za ${days} dní`, tone: "warn", days } as const;
  return { key: "ok", label: `Za ${days} dní`, tone: "ok", days } as const;
}

export function addMonthsKeepingDay(value: Date, months: number) {
  const date = new Date(value);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, maxDay));
  return date;
}
