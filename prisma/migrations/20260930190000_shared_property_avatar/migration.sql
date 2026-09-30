ALTER TABLE "Property" ADD COLUMN "avatarPhotoId" TEXT,
ADD COLUMN "avatarData" BYTEA,
ADD COLUMN "avatarMimeType" TEXT;

-- Prefer an actual uploaded image when several users made personal choices.
-- Keep the personal rows intact for their colors and favorites (and rollback safety).
WITH chosen AS (
  SELECT DISTINCT ON (p.id) p.id, a."photoId", a."avatarData", a."avatarMimeType"
  FROM "Property" p
  JOIN "UserEntityAppearance" a ON a."entityKey" = 'property:' || p.id
  WHERE a."photoId" IS NOT NULL
  ORDER BY p.id, CASE WHEN a."photoId" = 'upload' AND a."avatarData" IS NOT NULL THEN 0 ELSE 1 END, a."updatedAt" DESC, a.id DESC
)
UPDATE "Property" p SET "avatarPhotoId" = chosen."photoId",
  "avatarData" = CASE WHEN chosen."photoId" = 'upload' THEN chosen."avatarData" ELSE NULL END,
  "avatarMimeType" = CASE WHEN chosen."photoId" = 'upload' THEN chosen."avatarMimeType" ELSE NULL END
FROM chosen WHERE p.id = chosen.id;
