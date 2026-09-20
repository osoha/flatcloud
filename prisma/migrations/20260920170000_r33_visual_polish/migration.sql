ALTER TABLE "UserEntityAppearance" ADD COLUMN "avatarData" BYTEA, ADD COLUMN "avatarMimeType" TEXT;
CREATE TABLE "MeterTariff" (
 "id" TEXT NOT NULL, "meterId" TEXT NOT NULL, "validFrom" TIMESTAMP(3) NOT NULL,
 "priceCentsPerUnit" DECIMAL(14,4) NOT NULL, "monthlyAdvanceCents" INTEGER NOT NULL,
 "unitOfMeasure" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MeterTariff_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MeterTariff_values_check" CHECK ("priceCentsPerUnit" >= 0 AND "monthlyAdvanceCents" >= 0),
 CONSTRAINT "MeterTariff_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MeterTariff_meterId_validFrom_key" ON "MeterTariff"("meterId", "validFrom");
