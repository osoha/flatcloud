import { redirect } from "next/navigation";
import { subscriptionsEnabled, summaryForUser } from "./subscriptions/service";
import type { SubscriptionUserContext } from "./subscriptions/types";

/** Call only after native ACL and portfolio selection have resolved the actual data. */
export async function requirePortfolioOversight(user: SubscriptionUserContext, properties: { id: string; units: { id: string }[] }[]) {
  if (user.role === "SUPER_ADMIN" || !(await subscriptionsEnabled())) return;
  const visibleProperties = new Set(properties.map(property => property.id));
  const visibleUnits = new Set(properties.flatMap(property => property.units.map(unit => unit.id)));
  const accounts = await summaryForUser(user.id);
  const restricted = accounts.some(account => account.enabled && account.enrolled && !account.features.portfolioOversight && account.scopes.some(scope => scope.unitId ? visibleUnits.has(scope.unitId) : visibleProperties.has(scope.propertyId)));
  if (restricted) redirect("/ucet/predplatne?reason=portfolioOversight");
}
