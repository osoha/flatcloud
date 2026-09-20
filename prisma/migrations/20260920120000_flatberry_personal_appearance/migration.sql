CREATE TABLE "UserEntityAppearance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityKey" TEXT NOT NULL,
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "color" TEXT,
  "photoId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserEntityAppearance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserEntityAppearance_userId_entityKey_key" ON "UserEntityAppearance"("userId", "entityKey");
ALTER TABLE "UserEntityAppearance" ADD CONSTRAINT "UserEntityAppearance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
