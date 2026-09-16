-- Additive history: existing readings retain unknown author/method; no fabricated provenance.
ALTER TABLE "MeterReading"
 ADD COLUMN "method" TEXT NOT NULL DEFAULT 'LEGACY',
 ADD COLUMN "unitOfMeasure" TEXT,
 ADD COLUMN "createdById" TEXT,
 ADD COLUMN "correctsId" TEXT,
 ADD COLUMN "correctionReason" TEXT,
 ADD COLUMN "evidenceDocumentId" TEXT,
 ADD COLUMN "evidenceSnapshot" JSONB;
UPDATE "MeterReading" r SET "unitOfMeasure" = m."unitOfMeasure" FROM "Meter" m WHERE m.id=r."meterId";
CREATE UNIQUE INDEX "MeterReading_correctsId_key" ON "MeterReading"("correctsId");
ALTER TABLE "MeterReading"
 ADD CONSTRAINT "MeterReading_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "MeterReading_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "MeterReading"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "MeterReading_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "Document"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "MeterReading_method_check" CHECK (method IN ('LEGACY','PERSONAL','REMOTE','ESTIMATE')),
 ADD CONSTRAINT "MeterReading_correction_check" CHECK ("correctsId" IS NULL OR ("correctsId" <> id AND "correctionReason" IS NOT NULL AND length(trim("correctionReason")) > 0));
CREATE FUNCTION flatcloud_preserve_meter_reading() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'MeterReading is immutable; append a correction'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MeterReading_immutable" BEFORE UPDATE OR DELETE ON "MeterReading"
 FOR EACH ROW EXECUTE FUNCTION flatcloud_preserve_meter_reading();
