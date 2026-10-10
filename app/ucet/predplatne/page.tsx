import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, previewContext } from "@/lib/auth";
import { getSubscriptionConfig, subscriptionsSandboxEnabled, summaryForUser } from "@/lib/subscriptions/service";
import { Shell } from "@/components/Shell";
import { PageHeading } from "@/components/PageHeading";
import { Flash } from "@/components/FormUi";
import { CustomerSubscriptions } from "@/components/subscriptions/CustomerSubscriptions";
import styles from "@/components/subscriptions/subscriptions.module.css";

export const dynamic = "force-dynamic";

export default async function MySubscriptionPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; reason?: string }> }) {
  const user = await requireUser();
  if (user.role === "TENANT") redirect("/portal/najemnik/ucet");
  if (!subscriptionsSandboxEnabled()) redirect("/ucet");
  const [config, summaries, preview, query] = await Promise.all([getSubscriptionConfig(), summaryForUser(user.id), previewContext(), searchParams]);
  return <Shell user={user}><div className={`page ${styles.page}`}>
    <div className="breadcrumb"><Link href="/ucet">← Můj účet</Link></div>
    <div className="page-title"><div><PageHeading>Moje předplatné</PageHeading><p>{user.name} · tarify a platby pro moje portfolia</p></div></div>
    <Flash ok={query.ok} error={query.error}/>
    <CustomerSubscriptions user={user} summaries={summaries} config={config} preview={preview.requested} reason={query.reason}/>
  </div></Shell>;
}
