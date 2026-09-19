-- Expand the allowed range; preserve all existing plans and their snapshots.
ALTER TABLE "RentForecastPlan" DROP CONSTRAINT "RentForecastPlan_horizonMonths_check",
  ADD CONSTRAINT "RentForecastPlan_horizonMonths_check" CHECK ("horizonMonths" BETWEEN 1 AND 360);
