import type { SubscriptionConfig, SubscriptionSummary } from "@/lib/subscriptions/types";
import { subscriptionDate } from "./SubscriptionUi";
import styles from "./subscriptions.module.css";

/** A preview of reminder timing; this component never creates deliveries. */
export function SubscriptionReminderTimeline({ summary, config }: { summary: SubscriptionSummary; config: SubscriptionConfig }) {
  if (!summary.paidUntil || summary.plan === "FREE" || summary.status === "TEAM") return null;
  const expiry = new Date(summary.paidUntil);
  const now = summary.simulationNow ? new Date(summary.simulationNow) : new Date();
  const reminders = [...new Set(config.reminderDays)].sort((a, b) => a - b).map(day => ({ day, date: new Date(expiry.getTime() + day * 86_400_000) }));
  return <details className={styles.details}><summary>Upozornění a pozastavení práce</summary><p className={styles.help}>Náhled termínů podle aktuálního nastavení. Sandbox žádné e-maily neodesílá.</p><div className="table-wrap"><table className={styles.history}><thead><tr><th>Upozornění</th><th>Termín</th><th>Stav v náhledu</th></tr></thead><tbody>{reminders.map(({ day, date }) => <tr key={day}><td>{day < 0 ? `${Math.abs(day)} dnů před expirací` : day === 0 ? "Den expirace" : `${day} dnů po expiraci`}</td><td>{subscriptionDate(date)}</td><td>{now >= date ? "Termín dosažen" : "Naplánováno"}</td></tr>)}{summary.freezeAt && <tr><td>Pozastavení práce · data zachována</td><td>{subscriptionDate(summary.freezeAt)}</td><td>{now >= new Date(summary.freezeAt) ? "Pouze čtení" : "Naplánováno"}</td></tr>}</tbody></table></div></details>;
}
