-- IDENTITY-1: additive business identifiers with deterministic backfill.
CREATE SEQUENCE "Property_business_code_seq" MINVALUE 1001 START 1001 NO CYCLE;

ALTER TABLE "Property" ADD COLUMN "propertyCode" TEXT;
ALTER TABLE "Unit" ADD COLUMN "unitCode" TEXT;

DO $$
DECLARE property_count INTEGER;
BEGIN
  SELECT count(*) INTO property_count FROM "Property";
  IF property_count > 8999 THEN
    RAISE EXCEPTION 'Property business code range 1001-9999 exhausted during backfill';
  END IF;
END $$;

WITH ordered AS (
  SELECT id, 1000 + row_number() OVER (ORDER BY "createdAt" ASC, id ASC) AS code
  FROM "Property"
)
UPDATE "Property" p SET "propertyCode" = lpad(ordered.code::text, 4, '0')
FROM ordered WHERE p.id = ordered.id;

DO $$
DECLARE max_code INTEGER;
BEGIN
  SELECT max("propertyCode"::integer) INTO max_code FROM "Property";
  IF max_code IS NOT NULL THEN PERFORM setval('"Property_business_code_seq"', max_code, true); END IF;
END $$;

CREATE FUNCTION flatcloud_next_property_code() RETURNS TEXT AS $$
DECLARE candidate BIGINT;
BEGIN
  candidate := nextval('"Property_business_code_seq"');
  IF candidate > 9999 THEN RAISE EXCEPTION 'Property business code range 1001-9999 exhausted'; END IF;
  RETURN lpad(candidate::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION flatcloud_unit_number(label TEXT) RETURNS INTEGER AS $$
DECLARE matched TEXT[]; item TEXT[]; last_number TEXT;
BEGIN
  matched := regexp_match(label, '(byt|bj|jednotka|č\.?)\D{0,8}([0-9]+)', 'i');
  IF matched IS NOT NULL THEN RETURN matched[2]::integer; END IF;
  FOR item IN SELECT regexp_matches(label, '([0-9]+)', 'g') LOOP last_number := item[1]; END LOOP;
  IF last_number IS NULL THEN RETURN NULL; END IF;
  RETURN last_number::integer;
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

WITH candidates AS (
  SELECT id, "propertyId", flatcloud_unit_number(label) AS candidate
  FROM "Unit"
), unique_candidates AS (
  SELECT *, count(*) OVER (PARTITION BY "propertyId", candidate) AS uses
  FROM candidates
)
UPDATE "Unit" u SET "unitCode" = lpad(c.candidate::text, 3, '0')
FROM unique_candidates c
WHERE u.id = c.id AND c.candidate BETWEEN 1 AND 999 AND c.uses = 1;

DO $$
DECLARE row_record RECORD; candidate INTEGER;
BEGIN
  FOR row_record IN SELECT id, "propertyId" FROM "Unit" WHERE "unitCode" IS NULL ORDER BY "createdAt" ASC, id ASC LOOP
    SELECT n INTO candidate FROM generate_series(1, 999) n
    WHERE NOT EXISTS (SELECT 1 FROM "Unit" used WHERE used."propertyId" = row_record."propertyId" AND used."unitCode" = lpad(n::text, 3, '0'))
    ORDER BY n LIMIT 1;
    IF candidate IS NULL THEN RAISE EXCEPTION 'Unit business code range exhausted for property %', row_record."propertyId"; END IF;
    UPDATE "Unit" SET "unitCode" = lpad(candidate::text, 3, '0') WHERE id = row_record.id;
  END LOOP;
END $$;

CREATE TABLE "UnitBusinessCodeReservation" (
  "propertyId" TEXT NOT NULL,
  "unitCode" TEXT NOT NULL,
  "unitId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitBusinessCodeReservation_pkey" PRIMARY KEY ("propertyId", "unitCode")
);
CREATE UNIQUE INDEX "UnitBusinessCodeReservation_unitId_key" ON "UnitBusinessCodeReservation"("unitId") WHERE "unitId" IS NOT NULL;
INSERT INTO "UnitBusinessCodeReservation" ("propertyId", "unitCode", "unitId") SELECT "propertyId", "unitCode", id FROM "Unit";

CREATE FUNCTION flatcloud_assign_unit_code() RETURNS trigger AS $$
DECLARE parsed INTEGER; candidate TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('flatcloud:unit-code:' || NEW."propertyId", 0));
  IF NEW."unitCode" IS NOT NULL AND NEW."unitCode" <> '' THEN candidate := NEW."unitCode";
  ELSE
    parsed := flatcloud_unit_number(NEW.label);
    IF parsed BETWEEN 1 AND 999 AND NOT EXISTS (SELECT 1 FROM "UnitBusinessCodeReservation" r WHERE r."propertyId" = NEW."propertyId" AND r."unitCode" = lpad(parsed::text, 3, '0')) THEN
      candidate := lpad(parsed::text, 3, '0');
    ELSE
      SELECT lpad(n::text, 3, '0') INTO candidate FROM generate_series(1, 999) n
      WHERE NOT EXISTS (SELECT 1 FROM "UnitBusinessCodeReservation" r WHERE r."propertyId" = NEW."propertyId" AND r."unitCode" = lpad(n::text, 3, '0')) ORDER BY n LIMIT 1;
    END IF;
  END IF;
  IF candidate IS NULL THEN RAISE EXCEPTION 'Unit business code range exhausted for property %', NEW."propertyId"; END IF;
  NEW."unitCode" := candidate;
  INSERT INTO "UnitBusinessCodeReservation" ("propertyId", "unitCode", "unitId") VALUES (NEW."propertyId", candidate, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION flatcloud_forbid_property_code_change() RETURNS trigger AS $$
BEGIN
  IF NEW."propertyCode" IS DISTINCT FROM OLD."propertyCode" THEN RAISE EXCEPTION 'propertyCode is immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION flatcloud_forbid_unit_code_change() RETURNS trigger AS $$
BEGIN
  IF NEW."unitCode" IS DISTINCT FROM OLD."unitCode" THEN RAISE EXCEPTION 'unitCode is immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "Property" ALTER COLUMN "propertyCode" SET DEFAULT flatcloud_next_property_code(), ALTER COLUMN "propertyCode" SET NOT NULL;
ALTER TABLE "Unit" ALTER COLUMN "unitCode" SET NOT NULL;
ALTER TABLE "Property" ADD CONSTRAINT "Property_propertyCode_check" CHECK ("propertyCode" ~ '^[1-9][0-9]{3}$' AND "propertyCode"::integer BETWEEN 1001 AND 9999);
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_unitCode_check" CHECK ("unitCode" ~ '^[0-9]{3}$' AND "unitCode"::integer BETWEEN 1 AND 999);
CREATE UNIQUE INDEX "Property_propertyCode_key" ON "Property"("propertyCode");
CREATE UNIQUE INDEX "Unit_propertyId_unitCode_key" ON "Unit"("propertyId", "unitCode");
CREATE TRIGGER "Unit_assign_business_code" BEFORE INSERT ON "Unit" FOR EACH ROW EXECUTE FUNCTION flatcloud_assign_unit_code();
CREATE TRIGGER "Property_business_code_immutable" BEFORE UPDATE ON "Property" FOR EACH ROW EXECUTE FUNCTION flatcloud_forbid_property_code_change();
CREATE TRIGGER "Unit_business_code_immutable" BEFORE UPDATE ON "Unit" FOR EACH ROW EXECUTE FUNCTION flatcloud_forbid_unit_code_change();
