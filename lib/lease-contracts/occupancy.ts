import { businessDateKey } from "../calendar";

type OccupancySource = {
  startDate: Date;
  occupants: Array<{ name: string; active: boolean }>;
  occupancyPeriods: Array<{ validFrom: Date; validTo: Date | null; personCount: number }>;
};

const normalizedName = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("cs");

/** Do not duplicate an ambiguous name or infer a missing birthday from a matching name. */
export function unlistedContractTenants<T extends { name: string; birthDate: string }>(tenants: T[], occupants: Array<{ name: string; birthDate?: string }>) {
  return tenants.filter(tenant => tenant.name.trim() && !occupants.some(person =>
    normalizedName(person.name) === normalizedName(tenant.name) &&
    (!person.birthDate || !tenant.birthDate || person.birthDate === tenant.birthDate),
  ));
}

/** Named contacts have no occupancy dates, so they must not determine a historical count. */
export function contractOccupancy(lease: OccupancySource) {
  const start = businessDateKey(lease.startDate);
  const periods = lease.occupancyPeriods.filter(period =>
    businessDateKey(period.validFrom) <= start &&
    (!period.validTo || businessDateKey(period.validTo) >= start),
  );
  return {
    occupantCount: periods.length === 1 ? periods[0].personCount : null,
    occupants: lease.occupants.filter(person => person.active).map(person => ({
      name: person.name,
      birthDate: "",
      role: "Člen domácnosti",
    })),
  };
}
