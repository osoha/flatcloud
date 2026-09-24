ALTER TABLE "Owner" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Owner_userId_key" ON "Owner"("userId");
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RegistrationRequest" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RegistrationRequest_email_key" ON "RegistrationRequest"("email");
CREATE UNIQUE INDEX "RegistrationRequest_tokenHash_key" ON "RegistrationRequest"("tokenHash");
CREATE INDEX "RegistrationRequest_expiresAt_idx" ON "RegistrationRequest"("expiresAt");
