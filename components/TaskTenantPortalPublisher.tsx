import { prisma } from "@/lib/db";
import { date } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { canPublishLeaseMessage } from "@/lib/tenant-portal-messages";

type Props = { user: { id: string; role: string; allProperties?: boolean }; task: { id: string; leaseId: string | null; tenantId: string | null; tenantPortalRequest: boolean; tenantPortalTitle: string | null; tenantPortalBody: string | null; tenantPortalPublishedAt: Date | null; updatedAt: Date } };
export async function TaskTenantPortalPublisher({ user, task }: Props) {
  if (!task.leaseId || !task.tenantId || task.tenantPortalRequest) return null;
  const lease = await canPublishLeaseMessage(user, task.leaseId);
  if (!lease) return null;
  const active = leaseStatusAt(lease) === "ACTIVE";
  const confirmations = task.tenantPortalPublishedAt ? await prisma.taskUserState.findMany({ where: { taskId: task.id, tenantConfirmedAt: { not: null } }, select: { tenantConfirmedAt: true, user: { select: { id: true, name: true } } } }) : [];
  return <section className="card task-portal-publisher" id="portal-najemnika"><h2>Zadání pro nájemníka</h2><p>{task.tenantPortalPublishedAt ? "Zveřejněno v portálu nájemníka." : "Tento úkol je zatím pouze interní."} Nájemník uvidí pouze níže uvedený text, termín, stav a jméno vystavitele. Interní diskuse a přílohy zůstanou soukromé.</p>{!active && <p>Zveřejnění nového zadání je dostupné během aktuálního nájmu.</p>}<form action={`/api/tasks/${task.id}/tenant-portal`} method="post" className="form-grid"><input type="hidden" name="action" value="publish"/><input type="hidden" name="revision" value={task.updatedAt.toISOString()}/><label className="field field-full"><span>Název pro nájemníka</span><input name="tenantPortalTitle" maxLength={140} required defaultValue={task.tenantPortalTitle || ""}/></label><label className="field field-full"><span>Sdělení nájemníkovi</span><textarea name="tenantPortalBody" rows={4} maxLength={5000} required defaultValue={task.tenantPortalBody || ""}/></label><div className="form-actions field-full"><button className="primary" disabled={!active}>{task.tenantPortalPublishedAt ? "Zveřejnit aktualizované zadání" : "Zveřejnit v portálu nájemníka"}</button></div></form>{confirmations.map(item => <p key={item.user.id}>{item.user.name} · přijetí potvrzeno {date(item.tenantConfirmedAt!)}</p>)}{task.tenantPortalPublishedAt && <form action={`/api/tasks/${task.id}/tenant-portal`} method="post"><input type="hidden" name="action" value="unpublish"/><input type="hidden" name="revision" value={task.updatedAt.toISOString()}/><button className="secondary">Stáhnout z portálu</button></form>}</section>;
}
