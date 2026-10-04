export type LeaseAttentionAlert = { kind: string; lease: { id: string } };
export type LeaseAutomationTask = { leaseId: string | null; automationRule: { event: string } | null };

export function hideAlertsCoveredByAutomaticTasks<T extends LeaseAttentionAlert>(alerts: T[], tasks: LeaseAutomationTask[]) {
  const coveredEvents = new Set(tasks.filter((task) => task.automationRule && task.leaseId).map((task) => `${task.leaseId}:${task.automationRule!.event}`));
  return alerts.filter((alert) => !coveredEvents.has(`${alert.lease.id}:LEASE_${alert.kind}`));
}
