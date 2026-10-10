import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, previewContext } from "@/lib/auth";
import { getSubscriptionConfig, subscriptionsSandboxEnabled } from "@/lib/subscriptions/service";
import { Shell } from "@/components/Shell";
import { PageHeading } from "@/components/PageHeading";
import { Flash } from "@/components/FormUi";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
import { AdminPlanForms, AdminBillingSettings } from "@/components/subscriptions/AdminPlanForms";
import styles from "@/components/subscriptions/subscriptions.module.css";

export const dynamic = "force-dynamic";

export default async function TariffsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN" || !subscriptionsSandboxEnabled()) redirect("/portfolio");
  const preview = await previewContext();
  if (preview.requested) redirect("/ucet/predplatne");
  const [config, query] = await Promise.all([getSubscriptionConfig(), searchParams]);
  return <Shell user={user}><div className={`page ${styles.page}`}>
    <div className="page-title"><div><PageHeading>Tarify a předplatné</PageHeading><p>Ceník, kapacita a dostupné funkce. Nastavení konkrétního plátce patří do jeho uživatelského profilu.</p></div><Link className="secondary" href="/uzivatele">Správa uživatelů</Link></div>
    <AdminSubnav active="subscriptions"/>
    <Flash ok={query.ok} error={query.error}/>
    <div className={`${styles.notice} ${styles.sandbox}`}><strong>Sandboxový modul předplatného</strong><p>Ukládá nastavení do sandboxové databáze. Platby jsou simulované; žádná platební brána ani skutečné odesílání upozornění nejsou zapojené.</p></div>
    <AdminPlanForms config={config}/>
    <div className={styles.notice}>Změna ceny se použije pro nová předplatná. Stávající smluvené ceny zůstanou zachované, dokud je v profilu plátce výslovně neaktualizujete. Přepínače dostupných funkcí se uplatní v rámci tarifů; jednotlivé výjimky nastavíte u konkrétního předplatného.</div>
    <AdminBillingSettings config={config}/>
  </div></Shell>;
}
