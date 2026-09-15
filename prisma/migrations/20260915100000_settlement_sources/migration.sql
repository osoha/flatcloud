CREATE TABLE "SettlementSource" (
 "id" TEXT PRIMARY KEY, "propertyId" TEXT NOT NULL REFERENCES "Property"("id") ON DELETE RESTRICT,
 "documentId" TEXT REFERENCES "Document"("id") ON DELETE RESTRICT,
 "identityKey" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
 "previousId" TEXT UNIQUE REFERENCES "SettlementSource"("id") ON DELETE RESTRICT,
 "payload" JSONB NOT NULL, "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "confirmedById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
 "confirmedAt" TIMESTAMP(3), "confirmation" JSONB,
 CONSTRAINT "SettlementSource_confirmation_check" CHECK (("confirmedAt" IS NULL AND "confirmedById" IS NULL AND "confirmation" IS NULL) OR ("confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL AND "confirmation" IS NOT NULL AND "documentId" IS NOT NULL)),
 UNIQUE ("propertyId", "identityKey", "version")
);
CREATE INDEX "SettlementSource_propertyId_createdAt_idx" ON "SettlementSource"("propertyId", "createdAt");
CREATE FUNCTION protect_settlement_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Settlement source history is immutable'; END IF;
 IF OLD."confirmedAt" IS NOT NULL OR (to_jsonb(NEW) - ARRAY['confirmedAt','confirmedById','confirmation']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['confirmedAt','confirmedById','confirmation']) THEN
 RAISE EXCEPTION 'Settlement source content is immutable; create a revision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "SettlementSource_immutable" BEFORE UPDATE OR DELETE ON "SettlementSource" FOR EACH ROW EXECUTE FUNCTION protect_settlement_source();
