import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { propertyPermissions, userRoles } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const [users, invitations, query] = await Promise.all([
    prisma.user.findMany({ include: { memberships: { include: { property: true } } }, orderBy: { name: "asc" } }),
    prisma.userInvitation.findMany({ where: { status: "PENDING" }, include: { property: true, invitedBy: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    searchParams,
  ]);
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Uživatelé a oprávnění</h1><p>Hlavní administrátor může upravit globální roli i přístup ke každé nemovitosti.</p></div></div><Flash ok={query.ok} error={query.error}/><div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Aktivní účty</h2><p>Oprávnění k objektům se spravují v detailu uživatele.</p></div></div><div className="table-wrap"><table><thead><tr><th>Uživatel</th><th>Role</th><th>Nemovitosti</th><th>Stav</th><th></th></tr></thead><tbody>{users.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><span className="owner-sub">{row.email}</span></td><td>{userRoles[row.role]}</td><td>{row.role === "SUPER_ADMIN" || row.role === "MANAGER" ? "Všechny" : row.memberships.length ? row.memberships.map((membership) => `${membership.property.name} (${propertyPermissions[membership.permission]})`).join(", ") : "Bez přístupu"}</td><td><span className={`status ${row.active ? "ok" : "bad"}`}>{row.active ? "Aktivní" : "Deaktivovaný"}</span></td><td><Link className="table-link" href={`/uzivatele/${row.id}`}>Upravit</Link></td></tr>)}</tbody></table></div></div><div className="card portfolio-table-card" style={{ marginTop: 16 }}><div className="table-toolbar"><div><h2>Čekající pozvánky</h2><p>Pozvánky lze zrušit přímo v detailu příslušné nemovitosti.</p></div></div><div className="table-wrap"><table><thead><tr><th>E-mail</th><th>Nemovitost</th><th>Oprávnění</th><th>Pozval</th><th>Platnost</th></tr></thead><tbody>{invitations.length ? invitations.map((invite) => <tr key={invite.id}><td>{invite.email}</td><td><Link className="table-link" href={`/nemovitosti/${invite.propertyId}/uzivatele`}>{invite.property.name}</Link></td><td>{propertyPermissions[invite.permission]}</td><td>{invite.invitedBy.name}</td><td>{invite.expiresAt.toLocaleDateString("cs-CZ")}</td></tr>) : <tr><td colSpan={5} className="table-empty">Bez čekajících pozvánek</td></tr>}</tbody></table></div></div></div></Shell>;
}
