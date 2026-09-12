import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Database, HardDrive, Mail, Settings2, ShieldCheck, Users } from "lucide-react";
import { Shell } from "@/components/Shell";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const [settings, activeUsers, templates, unmatched] = await Promise.all([
    appSettings(),
    prisma.user.count({ where: { active: true } }),
    prisma.reportDesignTemplate.count(),
    Promise.all([
      prisma.bankTransaction.count({ where: { amountCents: { gt: 0 }, status: { in: ["UNMATCHED", "SUGGESTED"] } } }),
      prisma.inboxPayment.count({ where: { status: { in: ["RECEIVED", "UNMATCHED", "ERROR"] } } }),
    ]).then((rows) => rows.reduce((sum, value) => sum + value, 0)),
  ]);
  const mailboxReady = Boolean(settings.inboundMailEnabled && settings.inboundMailHost && settings.inboundMailUser && settings.inboundMailPasswordEncrypted);
  const driveReady = process.env.FILE_STORAGE_DRIVER === "gdrive" && Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
  const smtpReady = Boolean(settings.smtpHost || process.env.SMTP_HOST) && Boolean(settings.smtpFromEmail || process.env.SMTP_FROM_EMAIL);

  return <Shell user={user}><div className="page admin-overview-page">
    <div className="page-title"><div><h1>Administrace</h1><p>Stav systému a vstup do globálních nastavení aplikace.</p></div></div>
    <AdminSubnav active="overview"/>
    <div className="admin-health-grid" aria-label="Stav klíčových služeb">
      <Health label="Bankovní schránka" ready={mailboxReady}/>
      <Health label="Google Drive" ready={driveReady}/>
      <Health label="Odesílání e-mailů" ready={smtpReady}/>
      <div className="card admin-health-card"><span>Nespárované položky</span><strong>{unmatched}</strong><Link href="/platby/nesparovane">Otevřít frontu</Link></div>
    </div>
    <div className="admin-module-grid">
      <Module icon={<Settings2/>} title="Integrace a automatizace" text="Bankovní schránka, Drive, SMTP, upomínky a zdroje dat." href="/nastaveni/system" cta="Spravovat nastavení"/>
      <Module icon={<BarChart3/>} title="Reporting" text={`${templates} šablon · skupiny, verzované šablony a publikované výstupy.`} href="/reporty/sablony" cta="Otevřít reporting"/>
      <Module icon={<Users/>} title="Uživatelé a přístupy" text={`${activeUsers} aktivních uživatelů · role, pozvánky a oprávnění.`} href="/uzivatele" cta="Spravovat uživatele"/>
      <Module icon={<Database/>} title="Data a importy" text="Cenová mapa MF a stav posledního načtení zdrojových dat." href="/nastaveni/system" cta="Otevřít datové zdroje"/>
      <Module icon={<ShieldCheck/>} title="Audit a údržba" text="Bezpečné ruční kontroly, retenční úlohy a provozní diagnostika." href="/nastaveni/system" cta="Otevřít údržbu"/>
      <Module icon={<HardDrive/>} title="Dokumenty" text="Centrální katalog dokumentů a kontrola uložených podkladů." href="/dokumenty" cta="Otevřít dokumenty"/>
    </div>
  </div></Shell>;
}

function Health({ label, ready }: { label: string; ready: boolean }) {
  return <div className="card admin-health-card"><span>{label}</span><strong className={ready ? "positive" : "negative"}>{ready ? "Připraveno" : "Vyžaduje kontrolu"}</strong><small>{ready ? <><CheckCircle2 size={13}/> Konfigurace je dostupná</> : <><Mail size={13}/> Otevřete nastavení</>}</small></div>;
}

function Module({ icon, title, text, href, cta }: { icon: React.ReactNode; title: string; text: string; href: string; cta: string }) {
  return <Link className="card admin-module-card" href={href}><span className="admin-module-icon">{icon}</span><div><h2>{title}</h2><p>{text}</p><strong>{cta} →</strong></div></Link>;
}
