import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";

export async function AutomationRunStatus({ only }: { only?: string[] }) {
  const run = await prisma.auditLog.findFirst({ where: { action: { in: ["SCHEDULER_CRON", "SCHEDULER_CRON_FAILED"] } }, orderBy: { createdAt: "desc" }, select: { action: true, createdAt: true, details: true } });
  const details = run?.details;
  const raw = details && typeof details === "object" && !Array.isArray(details) ? details.steps : null;
  const steps = Array.isArray(raw) ? raw.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.name !== "string" || typeof value.status !== "string" || typeof value.summary !== "string") return [];
    return !only || only.includes(value.name) ? [{ name: value.name, status: value.status, summary: value.summary }] : [];
  }) : [];
  const failed = run?.action.endsWith("FAILED") || steps.some(step => step.status === "failed");
  return <section className="card automation-run-status"><div className="card-head"><div><h2>Poslední běh plánovače</h2><p className="muted-copy">{run ? dateTime(run.createdAt) : "Zatím bez záznamu běhu."}</p></div>{run && <span className={`status ${failed ? "warn" : "ok"}`}>{failed ? "Běh obsahuje chybu" : "Dokončeno"}</span>}</div>{steps.length ? <div className="summary-list">{steps.map((step, index) => <div key={`${step.name}-${index}`}><span>{step.name}</span><strong className={step.status === "failed" ? "negative" : ""}>{step.summary}</strong></div>)}</div> : <p>Pro tyto kroky není v posledním běhu dostupný výsledek. Uložená data sama nepotvrzují, že poslední kontrola uspěla.</p>}</section>;
}
