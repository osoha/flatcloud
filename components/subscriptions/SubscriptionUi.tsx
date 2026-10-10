import { Check, Minus } from "lucide-react";
import styles from "./subscriptions.module.css";

export function subscriptionMoney(cents: number) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function subscriptionDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" }) : "—";
}

export const subscriptionStatusLabels: Record<string, string> = {
  FREE: "Zdarma", ACTIVE: "Zaplaceno", TRIAL: "Zkušební období", GRACE: "Po splatnosti", FROZEN: "Pouze čtení", EXEMPT: "Bez úhrady", CANCELLED: "Ukončeno", OVER_LIMIT: "Nad limitem", PENDING: "Čeká na úhradu", PAID: "Zaplaceno", FAILED: "Neúspěšná platba", UNMATCHED: "K ověření", TEAM: "FlatCloud team", GIFTED: "Darované období", PROMO: "Zvýhodněná nabídka", LEGACY: "Přechodné období",
};

export function SubscriptionStatus({ status, label }: { status: string; label?: string }) {
  const tone = ["FROZEN", "OVER_LIMIT", "FAILED"].includes(status) ? styles.bad : ["GRACE", "PENDING", "UNMATCHED"].includes(status) ? styles.warn : ["ACTIVE", "PAID", "EXEMPT", "TEAM"].includes(status) ? styles.good : "";
  return <span className={`${styles.badge} ${tone}`}>{label || subscriptionStatusLabels[status] || status}</span>;
}

export function SubscriptionMetric({ label, value, used, limit }: { label: string; value: string; used?: number; limit?: number | null }) {
  return <div className={styles.metric}><span className={styles.label}>{label}</span><strong>{value}</strong>{used !== undefined && limit != null && limit > 0 && <div className={styles.meter} aria-label={`${label}: ${used} z ${limit}`}><span style={{ width: `${Math.min(100, used / limit * 100)}%` }}/></div>}</div>;
}

export function SubscriptionFeatureList({ features }: { features: { label: string; enabled: boolean }[] }) {
  return <ul className={styles.features}>{features.map(feature => <li data-enabled={feature.enabled} key={feature.label}>{feature.enabled ? <Check size={15}/> : <Minus size={15}/>}<span>{feature.label}</span></li>)}</ul>;
}
