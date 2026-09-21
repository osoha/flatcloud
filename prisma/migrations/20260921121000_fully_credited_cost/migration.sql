-- A fully credited invoice retains its identity, documents and payment history.
-- Zero is valid; negative economic costs remain rejected.
ALTER TABLE "PropertyCost"
  DROP CONSTRAINT "PropertyCost_amountCents_check",
  ADD CONSTRAINT "PropertyCost_amountCents_check" CHECK ("amountCents" >= 0);
