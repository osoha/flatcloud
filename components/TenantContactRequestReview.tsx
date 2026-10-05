import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { contactChangeLabels, contactRequestStatusLabels, contactSnapshotFromJson, staffContactRequest, type TenantContactSnapshot } from "@/lib/tenant-contact-requests";

export async function TenantContactRequestReview({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  if (!canEdit) return null;
  const user = await currentUser();
  if (!user) return null;
  const task = await staffContactRequest(user, taskId);
  if (!task) return null;
  const request = task.contactChangeRequest!, before = contactSnapshotFromJson(request.before), requested = contactSnapshotFromJson(request.requested);
  const canReview = Boolean(task.tenant?.active && task.lease!.unit.property.active && leaseStatusAt(task.lease!) === "ACTIVE");
  return <section className="card" id="zmena-kontaktu">
    <h2>Nahlášená změna kontaktů</h2>
    <p><strong>{contactRequestStatusLabels[request.status] || request.status}</strong> · nahlášeno {dateTime(request.createdAt)}</p>
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>Údaj</th><th>Při nahlášení</th><th>Požadovaná změna</th></tr></thead><tbody>{Object.keys(requested).map(raw => {
      const key = raw as keyof TenantContactSnapshot;
      return <tr key={key}><th>{contactChangeLabels[key]}</th><td>{before[key] || "Neuvedeno"}</td><td>{requested[key] || "Odstranit údaj"}</td></tr>;
    })}</tbody></table></div>
    {request.reason && <p style={{ whiteSpace: "pre-wrap" }}>{request.reason}</p>}
    <p>Převzetí zaznamená další postup a informuje nájemníka. Samo nemění jeho kontakty ani přihlášení. Nový e-mail nejprve ověřte s nájemníkem a dohodněte přístup do portálu.</p>
    {request.reviewedAt && <p>{dateTime(request.reviewedAt)} · {request.reviewNote}</p>}
    {request.status === "PENDING" && !canReview && <p>Nahlášení lze vyřídit pouze u aktivního nájemníka a aktuálního nájmu.</p>}
    {request.status === "PENDING" && canReview && <form action={`/api/tasks/${taskId}/contact-change-request`} method="post" className="form-grid">
      <input type="hidden" name="revision" value={request.updatedAt.toISOString()}/>
      <label className="field field-full"><span>Zpráva nájemníkovi a další postup</span><textarea name="reviewNote" required minLength={5} maxLength={2000} rows={3} placeholder="Napište, co s nájemníkem potřebujete ověřit a jak budete postupovat."/></label>
      <div className="actions"><button className="primary" name="decision" value="ACKNOWLEDGED">Převzít k vyřízení</button><button className="secondary" name="decision" value="REJECTED">Zamítnout s vysvětlením</button></div>
    </form>}
    <p><Link href={`/najemnici/${task.tenantId}`}>Otevřít kartu nájemníka</Link> · Další domluvu veďte ve zprávách pro nájemníka u tohoto úkolu.</p>
  </section>;
}
