import Link from "next/link";
import type { SubscriptionSummary } from "@/lib/subscriptions/types";
import styles from "./ShellSubscriptionNotice.module.css";

export function ShellSubscriptionNotice({ accounts, propertyIds = [], preview = false }: { accounts: SubscriptionSummary[]; propertyIds?: string[]; preview?: boolean }) {
  const notices = accounts.filter(account => account.enabled && account.enrolled && account.reminder && (!propertyIds.length || account.scopes.some(scope => propertyIds.includes(scope.propertyId))));
  if (!notices.length) return null;
  return <section className={styles.notice} aria-label="Stav předplatného"><ul>{notices.map(account => <li key={account.accountId}><strong>{account.billingName || account.payerName}</strong><span>{account.reminder}</span><Link href={`/ucet/predplatne?accountId=${encodeURIComponent(account.accountId || "")}`}>Tarif a platby →</Link></li>)}</ul>{preview && <small>Zobrazeno podle předplatného uživatele. Náhled je pouze pro čtení.</small>}</section>;
}
