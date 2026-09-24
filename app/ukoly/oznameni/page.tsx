import { TaskSectionNav } from "@/components/TaskSectionNav";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date } from "@/lib/format";
import { activeAnnouncementWhere, announcementAudienceWhere } from "@/lib/announcements";

export const dynamic = "force-dynamic";
const labels = { INFO: "Informace", IMPORTANT: "Důležité", CRITICAL: "Kritické" } as const;

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const hidden = query.view === "hidden";
  const where = hidden
    ? { AND: [announcementAudienceWhere(user), { userStates: { some: { userId: user.id, dismissedAt: { not: null } } } }] }
    : { AND: [activeAnnouncementWhere(user), { NOT: { userStates: { some: { userId: user.id, dismissedAt: { not: null } } } } }] };
  const announcements = await prisma.announcement.findMany({ where, include: { userStates: { where: { userId: user.id } } }, orderBy: [{ severity: "desc" }, { startsAt: "desc" }] });
  return <Shell user={user}><div className="page announcements-page"><div className="page-title"><div><PageHeading>Oznámení</PageHeading><p>Provozní a legislativní sdělení určená vašemu účtu, roli nebo spravovaným nemovitostem.</p></div></div><TaskSectionNav user={user} active="announcements"/><Flash ok={query.ok} error={query.error}/><div className="task-status-tabs"><Link className={!hidden?"active":""} href="/ukoly/oznameni">Aktivní</Link><Link className={hidden?"active":""} href="/ukoly/oznameni?view=hidden">Skrytá</Link></div><div className="announcement-list">{announcements.length?announcements.map(item=><article id={`oznameni-${item.id}`} className={`card announcement-card severity-${item.severity.toLowerCase()}`} key={item.id}><div className="card-head"><div><span className={`status ${item.severity==="CRITICAL"?"bad":item.severity==="IMPORTANT"?"warn":"ok"}`}>{labels[item.severity]}</span><h2>{item.title}</h2></div><small>{item.expiresAt?`Platí do ${date(item.expiresAt)}`:"Bez exspirace"}</small></div><p>{item.body}</p><form action={`/api/announcements/${item.id}/state`} method="post"><input type="hidden" name="action" value={hidden?"restore":"dismiss"}/><input type="hidden" name="returnTo" value={hidden?"/ukoly/oznameni?view=hidden":"/ukoly/oznameni"}/><button className="secondary" type="submit">{hidden?"Vrátit mezi aktivní":"Už nezobrazovat"}</button></form></article>):<div className="card empty-state"><h2>{hidden?"Žádná skrytá oznámení":"Žádná aktivní oznámení"}</h2><p>{hidden?"Všechna sdělení se zobrazují standardně.":"Aktuálně pro vás není publikováno žádné sdělení."}</p></div>}</div></div></Shell>;
}
