-- 活动签到体系：签到校验位置开关 + 签到校验码开关 + 6 位签到码
-- 存量回填：已配置场地经纬度的活动视为「开启位置校验」，签到行为与改造前一致；
-- checkinCodeRequired 默认 true 但存量 checkinCode 为 NULL，业务口径上「不强制输码」
-- （仅 required=true 且 checkinCode 非空时才要求客户端输入签到码）。
ALTER TABLE "CommunityEvent"
  ADD COLUMN "checkinLocationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkinCodeRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "checkinCode" VARCHAR(6);

UPDATE "CommunityEvent"
  SET "checkinLocationRequired" = ("venueLat" IS NOT NULL AND "venueLng" IS NOT NULL);