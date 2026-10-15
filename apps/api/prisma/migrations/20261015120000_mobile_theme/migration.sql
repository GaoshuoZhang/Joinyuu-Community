CREATE TABLE "MobileThemePackage" (
  "id" TEXT NOT NULL, "themeId" TEXT NOT NULL, "version" TEXT NOT NULL,
  "manifest" JSONB NOT NULL, "assets" JSONB NOT NULL, "checksum" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT NOT NULL,
  CONSTRAINT "MobileThemePackage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MobileThemePackage_checksum_key" ON "MobileThemePackage"("checksum");
CREATE TABLE "MobileThemeState" (
  "id" INTEGER NOT NULL DEFAULT 1, "activeId" TEXT, "previousId" TEXT, "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "MobileThemeState_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MobileThemePreview" (
  "tokenHash" TEXT NOT NULL, "packageId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobileThemePreview_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "MobileThemePreview_expiresAt_idx" ON "MobileThemePreview"("expiresAt");
INSERT INTO "MobileThemeState" ("id") VALUES (1);
