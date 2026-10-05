/** A preview-only pilot. No issuance, storage, signatures or delivery. */
export function leaseContractPilotEnabled() {
  return process.env.RENDER_SERVICE_ID === "srv-dacselkmqu1s73bmjoq0" ||
    (process.env.LEASE_CONTRACT_LOCAL_PILOT === "1" && !process.env.RENDER_SERVICE_ID &&
      ["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL || "postgres://disabled@invalid/disabled").hostname));
}

export function isLeaseContractTestRecord(lease: {contractNumber: string | null; unit: {property: {name: string}}}) {
  return /^TEST(?:[- :]|$)/i.test(lease.contractNumber || "") && /^TEST(?:[- :]|$)/i.test(lease.unit.property.name);
}
