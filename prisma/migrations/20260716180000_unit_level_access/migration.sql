CREATE TABLE "UserUnit" (
  "userId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "permission" "PropertyPermission" NOT NULL DEFAULT 'VIEW',
  CONSTRAINT "UserUnit_pkey" PRIMARY KEY ("userId", "unitId")
);
CREATE INDEX "UserUnit_unitId_permission_idx" ON "UserUnit"("unitId", "permission");
ALTER TABLE "UserUnit" ADD CONSTRAINT "UserUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserUnit" ADD CONSTRAINT "UserUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD COLUMN "unitIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
