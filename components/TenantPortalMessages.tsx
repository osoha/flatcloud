import { ArrowRight, Bell, CheckCheck, ClipboardCheck } from "lucide-react";
import { tenantPortalMessages, type PortalMessageUser } from "@/lib/tenant-portal-messages";
import { date } from "@/lib/format";
import { taskStatuses } from "@/lib/labels";

type Props = { tenantId: string; leaseId: string; user: PortalMessageUser; preview: boolean };
export async function TenantPortalMessages({ tenantId, leaseId, user, preview }: Props) {
  const content = await tenantPortalMessages(user, tenantId, leaseId, preview);
  if (!content) return null;
  type MessageContent = NonNullable<typeof content>;
  const now = new Date();
  const activeTasks = content.tasks.filter(task => !["DONE", "CANCELLED"].includes(task.status));
  const archivedTasks = content.tasks.filter(task => ["DONE", "CANCELLED"].includes(task.status));
  const isActive = (item: MessageContent["announcements"][number]) => item.active && (!item.expiresAt || item.expiresAt > now);
  const activeNotices = content.announcements.filter(item => isActive(item) && !item.userStates[0]?.dismissedAt);
  const archivedNotices = content.announcements.filter(item => !isActive(item) || item.userStates[0]?.dismissedAt);
  const archivedCount = archivedTasks.length + archivedNotices.length;
  const pendingCount = activeTasks.filter(task => !task.userStates[0]?.tenantConfirmedAt).length + activeNotices.filter(item => !item.userStates[0]?.readAt).length;

  function action(kind: "task" | "announcement", itemId: string, verb: string, label: string, revision?: string) {
    return <form action={`/api/portal/tenants/${tenantId}/messages`} method="post"><input type="hidden" name="leaseId" value={leaseId}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="itemId" value={itemId}/><input type="hidden" name="action" value={verb}/>{revision && <input type="hidden" name="revision" value={revision}/>}<button className="secondary tp-message-action" type="submit" disabled={preview}>{label}</button></form>;
  }
  function body(text: string) {
    if (text.length <= 280) return <p>{text}</p>;
    const excerpt = text.slice(0, 260).replace(/\s+\S*$/, "");
    return <><p>{excerpt}…</p><details className="tp-message-full"><summary>Přečíst celé sdělení</summary><p>{text}</p></details></>;
  }
  function notice(item: MessageContent["announcements"][number], archived = false) {
    return <article className={`tp-message tp-message-notice severity-${item.severity.toLowerCase()}`} key={item.id}>
      <span className="tp-message-icon"><Bell size={20} aria-hidden="true"/></span>
      <div className="tp-message-content"><div className="tp-message-meta"><span>{item.createdBy.name}</span><span>{date(item.startsAt)}</span>{item.severity !== "INFO" && <span className="tp-message-important">Důležité</span>}{!isActive(item) && <span>Ukončeno</span>}{item.userStates[0]?.readAt && <span>Přečteno</span>}</div><h3>{item.title}</h3>{body(item.body)}{item.expiresAt && <small>Platí do {date(item.expiresAt)}</small>}
        {isActive(item) && <div className="tp-message-actions">{archived ? action("announcement", item.id, "restore", "Vrátit mezi oznámení", item.updatedAt.toISOString()) : <>{!item.userStates[0]?.readAt && action("announcement", item.id, "read", "Přečetl/a jsem", item.updatedAt.toISOString())}{action("announcement", item.id, "dismiss", "Přesunout do archivu", item.updatedAt.toISOString())}</>}</div>}
      </div>
    </article>;
  }
  function task(item: MessageContent["tasks"][number], archived = false) {
    const confirmed = item.userStates[0]?.tenantConfirmedAt;
    return <article className="tp-message tp-message-task" key={item.id}><span className="tp-message-icon"><ClipboardCheck size={20} aria-hidden="true"/></span><div className="tp-message-content"><div className="tp-message-meta"><span>{item.tenantPortalPublishedBy?.name || "Správa domu"}</span><span>Úkol pro vás</span><span>{taskStatuses[item.status]}</span></div><h3>{item.tenantPortalTitle}</h3>{body(item.tenantPortalBody || "")}{item.dueAt && <strong className="tp-message-due">Prosíme vyřídit do {date(item.dueAt)}</strong>}<div className="tp-message-actions">{confirmed ? <span className="tp-message-confirmed"><CheckCheck size={16} aria-hidden="true"/> Přijetí potvrzeno {date(confirmed)}</span> : !archived && action("task", item.id, "confirm", "Potvrdit přijetí", item.tenantPortalPublishedAt!.toISOString())}<a className="tp-text-link" href={`#zpravy-spravci-${leaseId}--${item.id}`}>Otevřít konverzaci <ArrowRight size={15}/></a></div></div></article>;
  }
  const activeItems = [
    ...activeNotices.filter(item => item.severity !== "INFO").map(item => notice(item)),
    ...activeTasks.map(item => task(item)),
    ...activeNotices.filter(item => item.severity === "INFO").map(item => notice(item)),
  ];
  return <section className="tp-messages" id={`zpravy-${leaseId}`} aria-labelledby={`zpravy-title-${leaseId}`}>
    <div className="tp-section-heading"><div><span className="tp-eyebrow">Od správce a vlastníka</span><h2 id={`zpravy-title-${leaseId}`}>Oznámení a úkoly</h2></div>{pendingCount > 0 && <span className="tp-message-count">{pendingCount} k přečtení</span>}</div>
    {activeItems.length ? <><div className="tp-message-list">{activeItems.slice(0, 3)}</div>{activeItems.length > 3 && <details className="tp-message-archive"><summary>Zobrazit další oznámení a úkoly <span>{activeItems.length - 3}</span></summary><div className="tp-message-list">{activeItems.slice(3)}</div></details>}</> : <div className="tp-message-empty"><CheckCheck size={24} aria-hidden="true"/><p>Teď pro vás nemáme žádné nové zprávy ani úkoly.</p></div>}
    {preview && (activeTasks.length > 0 || activeNotices.length > 0) && <p className="tp-message-preview">Náhled správce · potvrzení a archivace jsou dostupné nájemníkovi.</p>}
    {archivedCount > 0 && <details className="tp-message-archive"><summary>Archiv zpráv a vyřízené úkoly <span>{archivedCount}</span></summary><div className="tp-message-list">{archivedNotices.map(item => notice(item, true))}{archivedTasks.map(item => task(item, true))}</div></details>}
  </section>;
}
