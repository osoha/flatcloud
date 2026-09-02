export interface AgentIssue {
  number?: number;
  title?: string;
  state?: string;
  body?: string;
  pull_request?: unknown;
}

export interface AgentPull {
  number?: number;
  state?: string;
  head?: { ref?: string };
}

export interface IntakeResult {
  status: "READY_FOR_IMPLEMENTATION" | "BLOCKED";
  failures: string[];
  risk: "LOW" | "MEDIUM" | "HIGH" | null;
  checklistItems: string[];
}

export interface QueueDecision {
  decision: "READY" | "BLOCKED" | "IDLE";
  reason: string;
  issue: { number: number; title: string; risk: IntakeResult["risk"] } | null;
}

export function validateAgentIssue(issue: AgentIssue): IntakeResult;
export function selectAgentWork(issues: AgentIssue[], pulls: AgentPull[]): QueueDecision;
