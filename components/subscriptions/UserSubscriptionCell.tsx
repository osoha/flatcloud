import Link from "next/link";
import type { SubscriptionSummary } from "@/lib/subscriptions/types";
import { SubscriptionStatus, subscriptionDate } from "./SubscriptionUi";
import styles from "./subscriptions.module.css";

export function UserSubscriptionCell({ userId, role, summaries }: { userId: string; role: string; summaries: SubscriptionSummary[] }) {
  if (role === "TENANT") return <td data-label="Tarif a platby" className={styles.tableCell}><strong>Portál nájemníka</strong><small>Bez samostatného předplatného</small></td>;
  const first = summaries[0];
  return <td data-label="Tarif a platby" className={styles.tableCell}><Link href={`/uzivatele/${userId}#predplatne`}>
    {first ? <><strong>{summaries.length > 1 ? `${summaries.length} portfolia` : first.status === "FREE" ? "Free / Basic" : first.plan === "PROFI" ? "Profi" : first.plan === "ENTERPRISE" ? "Enterprise" : "Free / Basic"}</strong><SubscriptionStatus status={summaries.some(summary => summary.status === "FROZEN") ? "FROZEN" : summaries.some(summary => summary.status === "GRACE") ? "GRACE" : first.status}/><small>{first.usage.units} / {first.effectiveCapacityUnits} jednotek{first.accessUntil ? ` · do ${subscriptionDate(first.accessUntil)}` : ""}</small></> : <><strong>Dosavadní přístup</strong><small>Tarif dosud nepřiřazen</small></>}
  </Link></td>;
}

export function UserSubscriptionSummary({ summaries }: { summaries: SubscriptionSummary[] }) {
  const groups = [
    { label: "Placená předplatná", status: "ACTIVE", count: summaries.filter(summary => summary.status === "ACTIVE").length },
    { label: "Po splatnosti", status: "GRACE", count: summaries.filter(summary => summary.status === "GRACE").length },
    { label: "Pouze čtení", status: "FROZEN", count: summaries.filter(summary => summary.status === "FROZEN").length },
    { label: "Zkušební a darovaná", status: "benefit", count: summaries.filter(summary => ["TRIAL", "GIFTED"].includes(summary.status)).length },
  ];
  return <div className={styles.summary} aria-label="Přehled předplatných">{groups.map(group => <Link key={group.status} href={`/uzivatele?payment=${group.status}#seznam-uzivatelu`}>{group.label}<strong>{group.count}</strong></Link>)}</div>;
}
