-- R1 review fixes: persist avatar, enforce identity ownership/uniqueness, and preserve consent versions.
ALTER TABLE "User" ADD COLUMN "avatar" VARCHAR(255);

DROP INDEX IF EXISTS "User_phone_idx";
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

ALTER TABLE "AccountDeletionRequest" ADD COLUMN "reason" VARCHAR(255);
ALTER TABLE "PointsRecord" ADD COLUMN "dedupeKey" VARCHAR(128);
CREATE UNIQUE INDEX "PointsRecord_dedupeKey_key" ON "PointsRecord"("dedupeKey");

DROP INDEX IF EXISTS "AgreementConsent_userId_agreementType_key";
CREATE UNIQUE INDEX "AgreementConsent_userId_agreementType_version_key"
  ON "AgreementConsent"("userId", "agreementType", "version");

-- A user may have at most one default address. The partial index also closes concurrent-write races.
CREATE UNIQUE INDEX "Address_one_default_per_user_key"
  ON "Address"("userId") WHERE "isDefault" = true;

ALTER TABLE "UserNotification"
  ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotificationPreference"
  ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Address"
  ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgreementConsent"
  ADD CONSTRAINT "AgreementConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
