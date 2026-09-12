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
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Šablony akcionářských reportů</h1><p>Globální, verzované vizuální předpisy. Aktivní a vyřazené verze jsou neměnné.</p></div></div><AdminSubnav active="reporting"/><div className="card table-wrap"><table><thead><tr><th>Šablona</th><th>Kód</th><th>Typ</th><th>Verze</th><th>Stav</th><th>Vytvořeno</th><th>Aktivováno</th></tr></thead><tbody>{templates.flatMap((template) => template.versions.map((version) => <tr key={version.id}><td><Link href={`/reporty/sablony/${version.id}`}>{template.name}</Link></td><td>{template.code}</td><td>{template.type}</td><td>v{version.version}</td><td>{version.status}</td><td>{version.createdAt.toLocaleDateString("cs-CZ")}</td><td>{version.activatedAt?.toLocaleDateString("cs-CZ") || "—"}</td></tr>))}</tbody></table></div></div></Shell>;
}
