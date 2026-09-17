-- Publishing limits are opt-in restrictions. Existing identities and all newly
-- seeded tiers start unlimited until an administrator configures a limit.
UPDATE "PublishingLimitRule" SET "dailyLimit" = -1;
