-- Preserve all issued records and their immutable trigger. Only the new v2
-- working-paper format may have a nonzero difference without financial links.
ALTER TABLE "ServiceSettlementProtocol"
  DROP CONSTRAINT "ServiceSettlementProtocol_financial_link_check",
  ADD CONSTRAINT "ServiceSettlementProtocol_financial_link_check" CHECK (COALESCE((
    (
      "snapshot"->>'schemaVersion' = '2' AND
      "snapshot"->>'purpose' = 'WORKING_PAPER' AND
      "chargeId" IS NULL AND "creditId" IS NULL AND "dueDate" IS NULL
    ) OR (
      "snapshot"->>'schemaVersion' = '1' AND (
        ("balanceCents" > 0 AND "chargeId" IS NOT NULL AND "creditId" IS NULL AND "dueDate" IS NOT NULL) OR
        ("balanceCents" < 0 AND "chargeId" IS NULL AND "creditId" IS NOT NULL AND "dueDate" IS NULL) OR
        ("balanceCents" = 0 AND "chargeId" IS NULL AND "creditId" IS NULL AND "dueDate" IS NULL)
      )
    )
  ), FALSE));
