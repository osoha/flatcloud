import { redirect } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date } from "@/lib/format";
import { userRoles } from "@/lib/labels";

export const dynamic = "force-dynamic";

const severityLabel = { INFO: "Informace", IMPORTANT: "Důležité", CRITICAL: "Kritické" } as const;

export default async function AnnouncementsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const query = await searchParams;
  const [announcements, properties, users] = await Promise.all([
    prisma.announcement.findMany({ include: { audiences: { include: { property: true, user: true } }, createdBy: true, _count: { select: { userStates: { where: { dismissedAt: { not: null } } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.property.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const now = new Date();
  return <Shell user={user}><div className="page announcement-admin-page">
    <div className="page-title"><div><PageHeading>Oznámení</PageHeading><p>Globální a lokální sdělení na hlavní obrazovce uživatelů. Skrytí je vždy osobní a vratné.</p></div></div>
    <AdminSubnav active="announcements"/><Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <form className="card edit-form col-5" action="/api/admin/announcements" method="post"><h2>Nové oznámení</h2><div className="form-grid">
        <label className="field field-full"><span>Název *</span><input name="title" required/></label>
        <label className="field field-full"><span>Sdělení *</span><textarea name="body" rows={5} required/></label>
        <label className="field"><span>Důležitost</span><select name="severity" defaultValue="INFO"><option value="INFO">Informace</option><option value="IMPORTANT">Důležité</option><option value="CRITICAL">Kritické</option></select></label>
        <label className="field"><span>Zobrazit od</span><input name="startsAt" type="datetime-local"/></label>
        <label className="field"><span>Exspirace</span><input name="expiresAt" type="datetime-local"/><small>Prázdné znamená trvalé oznámení.</small></label>
        <fieldset className="field field-full announcement-audience"><legend>Příjemci *</legend><label><input type="checkbox" name="allUsers"/> Všichni uživatelé</label><label><input type="checkbox" name="flatcloudMembers"/> Členové FlatCloud</label><label><span>Role</span><select name="roles" multiple size={4}>{Object.entries(userRoles).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Nemovitosti / místní sdělení</span><select name="propertyIds" multiple size={5}>{properties.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label><span>Konkrétní uživatelé</span><select name="userIds" multiple size={5}>{users.map(person=><option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label></fieldset>
      </div><div className="form-actions"><button className="primary" type="submit">Zveřejnit oznámení</button></div></form>
      <section className="col-7 stack-column"><div className="card"><h2>Publikovaná oznámení</h2><p className="muted-copy">Aktivní sdělení se zobrazují pouze zvolenému publiku v nastaveném čase.</p></div>{announcements.map(item=>{const scheduled=item.startsAt>now;const expired=Boolean(item.expiresAt&&item.expiresAt<=now);const state=!item.active?"Ukončeno":scheduled?"Naplánováno":expired?"Expirováno":"Aktivní";return <article className={`card announcement-admin-card severity-${item.severity.toLowerCase()}`} id={item.id} key={item.id}><div className="card-head"><div><span className={`status ${item.severity==="CRITICAL"?"bad":item.severity==="IMPORTANT"?"warn":"ok"}`}>{severityLabel[item.severity]}</span><h3>{item.title}</h3></div><span className={`status ${state==="Aktivní"?"ok":""}`}>{state}</span></div><p>{item.body}</p><dl className="announcement-meta"><div><dt>Publikum</dt><dd>{item.audiences.map(a=>a.kind==="ALL_USERS"?"Všichni":a.kind==="FLATCLOUD_MEMBERS"?"Členové FlatCloud":a.kind==="ROLE"?userRoles[a.role!]:a.kind==="PROPERTY"?a.property?.name:a.user?.name).join(" · ")}</dd></div><div><dt>Platnost</dt><dd>{date(item.startsAt)} – {item.expiresAt?date(item.expiresAt):"bez exspirace"}</dd></div><div><dt>Skrylo</dt><dd>{item._count.userStates} uživatelů</dd></div></dl><form action={`/api/admin/announcements/${item.id}`} method="post"><input type="hidden" name="action" value={item.active?"deactivate":"activate"}/><button className="secondary" type="submit">{item.active?"Ukončit oznámení":"Znovu aktivovat"}</button></form></article>})}</section>
    </div>
  </div></Shell>;
}
