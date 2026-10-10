import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminSubnav } from "@/components/admin/AdminSubnav";

export const dynamic = "force-dynamic";
export default async function ReportDesignTemplatesPage() {
  const user = await requireUser(); if (user.role !== "SUPER_ADMIN") redirect("/reporty");
  const templates = await prisma.reportDesignTemplate.findMany({ include: { versions: { orderBy: { version: "desc" } } }, orderBy: { name: "asc" } });
  return <Shell user={user}><div className="page"><div className="page-title"><div><PageHeading>Šablony akcionářských reportů</PageHeading><p>Globální, verzované vizuální předpisy. Otevřete detail verze pro náhled, pozadí a nastavení vzhledu. Aktivní verzi lze zkopírovat do nového konceptu; koncept lze upravit a aktivovat.</p></div></div><AdminSubnav active="reporting"/><div className="card table-wrap"><table><thead><tr><th>Šablona</th><th>Kód</th><th>Typ</th><th>Verze</th><th>Stav</th><th>Vytvořeno</th><th>Aktivováno</th><th>Akce</th></tr></thead><tbody>{templates.flatMap((template) => template.versions.map((version) => <tr key={version.id}><td><Link href={`/reporty/sablony/${version.id}`}>{template.name}</Link></td><td>{template.code}</td><td>{template.type}</td><td>v{version.version}</td><td>{version.status}</td><td>{version.createdAt.toLocaleDateString("cs-CZ")}</td><td>{version.activatedAt?.toLocaleDateString("cs-CZ") || "—"}</td><td><Link className="secondary" href={`/reporty/sablony/${version.id}`}>{version.status === "DRAFT" ? "Upravit koncept" : "Náhled a nová verze"}</Link></td></tr>))}</tbody></table></div></div></Shell>;
}
