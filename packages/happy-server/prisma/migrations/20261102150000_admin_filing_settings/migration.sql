ALTER TABLE "SiteSettings" ALTER COLUMN "icpNumber" SET DEFAULT '';
ALTER TABLE "SiteSettings" ALTER COLUMN "policeNumber" SET DEFAULT '';
ALTER TABLE "SiteSettings" ADD COLUMN "filingConfigured" BOOLEAN NOT NULL DEFAULT false;

-- Preserve custom settings. The previous built-in example pair needs an
-- explicit administrator save before being displayed on the public site.
UPDATE "SiteSettings" SET "filingConfigured" = true
WHERE ("icpNumber" <> '' OR "policeNumber" <> '')
AND NOT ("icpNumber" = '京ICP备2025125963号-1' AND "policeNumber" = '京公网安备11010502056950号');
